import { BigNumber } from "ethers";
import { IGetGasFeeResult } from "params/lib/gas-price-oracles/oracles";
import { ReputationStatus, MempoolEntryStatus } from "types/lib/executor";
import { IEntryPoint__factory } from "types/lib/executor/contracts";
import { parentPort } from "worker_threads";
import { MempoolEntry } from "../../entities/MempoolEntry";
import { Bundle, UserOpValidationResult } from "../../interfaces";
import { getAddr } from "../../utils";
import { getUserOpGasLimit } from "./utils";
import { getGasFee } from "params/lib";

async function asyncFunction(data: any) {
  const { logger, entries, networkConfig, reputationService, userOpValidationService, mempoolService, chainId, provider } = data;

  if (!entries.length) {
    logger.debug("No new entries");
    return;
  }
  const gasFee = await getGasFee(chainId, provider, networkConfig.etherscanApiKey);

  if (gasFee.gasPrice == undefined && gasFee.maxFeePerGas == undefined && gasFee.maxPriorityFeePerGas == undefined) {
    logger.debug("Could not fetch gas prices...");
    return;
  }

  const bundle = await createBundle(logger, gasFee, entries, networkConfig, reputationService, userOpValidationService, mempoolService, provider);

  await mempoolService.updateStatus(bundle.entries, MempoolEntryStatus.Pending);

  await mempoolService.attemptToBundle(bundle.entries);

  //send bundler
}

parentPort!.on("message", async (data) => {
  console.log(`Worker received inputs: `);
  const result = await asyncFunction(data);
  parentPort!.postMessage({ result });
});

async function createBundle(
  logger: any,
  gasFee: IGetGasFeeResult,
  entries: MempoolEntry[],
  networkConfig: any,
  reputationService: any,
  userOpValidationService: any,
  mempoolService: any,
  provider: any
): Promise<Bundle> {
  const bundle: Bundle = {
    storageMap: {},
    entries: [],
    maxFeePerGas: BigNumber.from(0),
    maxPriorityFeePerGas: BigNumber.from(0),
  };
  logger.debug("Creating bundle A ");
  const gasLimit = BigNumber.from(0);
  const paymasterDeposit: { [key: string]: BigNumber } = {};
  const stakedEntityCount: { [key: string]: number } = {};
  const senders = new Set<string>();
  const knownSenders = entries.map((it) => {
    return it.userOp.sender.toLowerCase();
  });
  logger.debug("Creating bundle B ");
  for (const entry of entries) {
    logger.debug("Creating bundle 1 ");

    if (getUserOpGasLimit(entry.userOp, gasLimit).gt(networkConfig.bundleGasLimit)) {
      logger.debug(`${entry.userOpHash} reached bundle gas limit`);
      continue;
    }

    logger.debug("Creating bundle B2 ");
    const entities = {
      paymaster: getAddr(entry.userOp.paymasterAndData),
      factory: getAddr(entry.userOp.initCode),
    };

    for (const [title, entity] of Object.entries(entities)) {
      if (!entity) continue;
      const status = await reputationService.getStatus(entity);
      if (status === ReputationStatus.BANNED) {
        logger.debug(`${title} - ${entity} is banned. Deleting userop ${entry.userOpHash}...`);
        await mempoolService.updateStatus(entries, MempoolEntryStatus.Cancelled, { revertReason: `${title} - ${entity} is banned.` });
        continue;
      } else if (status === ReputationStatus.THROTTLED || (stakedEntityCount[entity] ?? 0) > 1) {
        logger.debug(
          {
            sender: entry.userOp.sender,
            nonce: entry.userOp.nonce,
            entity,
          },
          `skipping throttled ${title}`
        );
        continue;
      }
    }
    logger.debug("Creating bundle B3 ");
    if (senders.has(entry.userOp.sender)) {
      logger.debug({ sender: entry.userOp.sender, nonce: entry.userOp.nonce }, "skipping already included sender");
      continue;
    }
    logger.debug("Creating bundle B4 ");
    let validationResult: UserOpValidationResult;
    try {
      validationResult = await userOpValidationService.simulateValidation(entry.userOp, entry.entryPoint, entry.hash);
    } catch (e: any) {
      logger.debug(`${entry.userOpHash} failed 2nd validation: ${e.message}. Deleting...`);
      await mempoolService.updateStatus(entries, MempoolEntryStatus.Cancelled, { revertReason: e.message });
      continue;
    }
    logger.debug("Creating bundle B5 ");

    // Check if userOp is trying to access storage of another userop
    if (validationResult.storageMap) {
      const sender = entry.userOp.sender.toLowerCase();
      const conflictingSender = Object.keys(validationResult.storageMap)
        .map((address) => address.toLowerCase())
        .find((address) => {
          return address !== sender && knownSenders.includes(address);
        });
      if (conflictingSender) {
        logger.debug(`UserOperation from ${entry.userOp.sender} sender accessed a storage of another known sender ${conflictingSender}`);
        continue;
      }
    }
    logger.debug("Creating bundle B6 ");
    // TODO: add total gas cap
    const entryPointContract = IEntryPoint__factory.connect(entry.entryPoint, provider);
    if (entities.paymaster) {
      const { paymaster } = entities;
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (!paymasterDeposit[paymaster]) {
        paymasterDeposit[paymaster] = await entryPointContract.balanceOf(paymaster);
      }
      if (paymasterDeposit[paymaster]?.lt(validationResult.returnInfo.prefund)) {
        logger.debug(`not enough balance in paymaster to pay for all UserOps: ${entry.userOpHash}`);
        // not enough balance in paymaster to pay for all UserOps
        // (but it passed validation, so it can sponsor them separately
        continue;
      }
      stakedEntityCount[paymaster] = (stakedEntityCount[paymaster] ?? 0) + 1;
      paymasterDeposit[paymaster] = BigNumber.from(paymasterDeposit[paymaster]?.sub(validationResult.returnInfo.prefund));
    }
    logger.debug("Creating bundle B7 ");

    if (entities.factory) {
      const { factory } = entities;
      stakedEntityCount[factory] = (stakedEntityCount[factory] ?? 0) + 1;
    }

    senders.add(entry.userOp.sender);

    bundle.entries.push(entry);
    const { maxFeePerGas, maxPriorityFeePerGas } = bundle;
    bundle.maxFeePerGas = maxFeePerGas.add(entry.userOp.maxFeePerGas);
    bundle.maxPriorityFeePerGas = maxPriorityFeePerGas.add(entry.userOp.maxPriorityFeePerGas);
  }

  logger.debug("Creating bundle C ");

  // skip gas fee protection on Fuse
  if (provider.network.chainId == 122) {
    bundle.maxFeePerGas = BigNumber.from(gasFee.maxFeePerGas);
    bundle.maxPriorityFeePerGas = BigNumber.from(gasFee.maxPriorityFeePerGas);
    return bundle;
  }

  if (bundle.entries.length > 1) {
    // average of userops
    bundle.maxFeePerGas = bundle.maxFeePerGas.div(bundle.entries.length);
    bundle.maxPriorityFeePerGas = bundle.maxPriorityFeePerGas.div(bundle.entries.length);
  }

  // if onchain fee is less than userops fee, use onchain fee
  if (bundle.maxFeePerGas.gt(gasFee.maxFeePerGas ?? gasFee.gasPrice!) && bundle.maxPriorityFeePerGas.gt(gasFee.maxPriorityFeePerGas!)) {
    bundle.maxFeePerGas = BigNumber.from(gasFee.maxFeePerGas ?? gasFee.gasPrice!);
    bundle.maxPriorityFeePerGas = BigNumber.from(gasFee.maxPriorityFeePerGas!);
  }
  logger.debug("Creating bundle D ");
  return bundle;
}

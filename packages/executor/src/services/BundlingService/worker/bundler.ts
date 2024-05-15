import { BigNumber, providers, Wallet } from "ethers";
import { IGetGasFeeResult } from "params/lib/gas-price-oracles/oracles";
import { IEntryPoint__factory } from "types/lib/executor/contracts";
import { UserOperationStruct } from "types/lib/executor/contracts/EntryPoint";
import { MempoolEntry } from "../../../entities/MempoolEntry";
import { Bundle, UserOpValidationResult } from "../../../interfaces";
import { getAddr } from "../../../utils";
import { nonGethErrorHandler, parseErrorResult } from "../../UserOpValidation/utils";
import { getUserOpGasLimit } from "../utils";
import { log } from "./WorkerMission";
import * as sapphire from "@oasisprotocol/sapphire-paratime";
// setup

const chainId = 23295;
const bundleGasLimit = 13e6;
const bundleGasLimitMarkup = 25000;
const provider = new providers.JsonRpcProvider("https://testnet.sapphire.oasis.io");

// setup

export async function submitTransaction(relayer: Wallet, transaction: providers.TransactionRequest): Promise<string> {
  const oasisRelayer = sapphire.wrap(relayer);
  const signedRawTx = await oasisRelayer.signTransaction(transaction);
  //const signedRawTx = await relayer.signTransaction(transaction);
  const method = "eth_sendRawTransaction";
  const params = [signedRawTx];
  let hash = await provider.send(method, params);
  return hash;
}

export async function createBundle(gasFee: IGetGasFeeResult, entries: MempoolEntry[], provider: any): Promise<Bundle> {
  const bundle: Bundle = {
    storageMap: {},
    entries: [],
    maxFeePerGas: BigNumber.from(0),
    maxPriorityFeePerGas: BigNumber.from(0),
  };
  const gasLimit = BigNumber.from(0);
  const paymasterDeposit: { [key: string]: BigNumber } = {};
  const stakedEntityCount: { [key: string]: number } = {};
  const senders = new Set<string>();
  const knownSenders = entries.map((it) => {
    return it.userOp.sender.toLowerCase();
  });
  log(" Create bundler A ");
  for (const entry of entries) {
    if (getUserOpGasLimit(entry.userOp, gasLimit).gt(bundleGasLimit)) {
      continue;
    }
    const entities = {
      paymaster: getAddr(entry.userOp.paymasterAndData),
      factory: getAddr(entry.userOp.initCode),
    };
    let validationResult: UserOpValidationResult;
    try {
      validationResult = await simulateValidation(entry.userOp, entry.entryPoint, entry.hash);
    } catch (e: any) {
      //await mempoolService.updateStatus(entries, MempoolEntryStatus.Cancelled, { revertReason: e.message });
      continue;
    }

    // Check if userOp is trying to access storage of another userop
    if (validationResult.storageMap) {
      const sender = entry.userOp.sender.toLowerCase();
      const conflictingSender = Object.keys(validationResult.storageMap)
        .map((address) => address.toLowerCase())
        .find((address) => {
          return address !== sender && knownSenders.includes(address);
        });
      if (conflictingSender) {
        continue;
      }
    }

    // TODO: add total gas cap
    const entryPointContract = IEntryPoint__factory.connect(entry.entryPoint, provider);
    if (entities.paymaster) {
      const { paymaster } = entities;
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (!paymasterDeposit[paymaster]) {
        paymasterDeposit[paymaster] = await entryPointContract.balanceOf(paymaster);
      }
      if (paymasterDeposit[paymaster]?.lt(validationResult.returnInfo.prefund)) {
        // not enough balance in paymaster to pay for all UserOps
        // (but it passed validation, so it can sponsor them separately
        continue;
      }
      stakedEntityCount[paymaster] = (stakedEntityCount[paymaster] ?? 0) + 1;
      paymasterDeposit[paymaster] = BigNumber.from(paymasterDeposit[paymaster]?.sub(validationResult.returnInfo.prefund));
    }

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
  log(" Create bundler B ");
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
  log(" Create bundler done ");
  return bundle;
}

async function simulateValidation(userOp: UserOperationStruct, entryPoint: string, codehash?: string): Promise<UserOpValidationResult> {
  return await validateUnsafely(userOp, entryPoint);
}

async function validateUnsafely(userOp: UserOperationStruct, entryPoint: string): Promise<UserOpValidationResult> {
  const validationGasLimit = 13e6;
  const entryPointContract = IEntryPoint__factory.connect(entryPoint, provider);
  const errorResult = await entryPointContract.callStatic
    .simulateValidation(userOp, {
      gasLimit: validationGasLimit,
    })
    .catch((e: any) => nonGethErrorHandler(entryPointContract, e));
  return parseErrorResult(userOp, errorResult);
}

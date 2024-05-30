import { parentPort, workerData } from "worker_threads";
import { BigNumber, ethers, providers, Wallet } from "ethers";
import { IEntryPoint__factory } from "types/lib/executor/contracts";
import { estimateBundleGasLimit, getUserOpGasLimit } from "../utils";
import { getGasFee } from "params/lib";
import { createBundle, submitTransaction } from "./bundler";
import { MempoolEntryStatus } from "types/lib/executor";
import { MempoolEntry } from "../../../entities/MempoolEntry";

const chainId = 23295;
const bundleGasLimit = 13e6;
const bundleGasLimitMarkup = 25000;
const provider = new providers.JsonRpcProvider("https://testnet.sapphire.oasis.io");

export async function log(text: string) {
    parentPort!.postMessage({ log: "✅" + text });
}

export async function logError(text: string) {
    parentPort!.postMessage({ log: "❌" + text });
}

export async function updateStatus(
    entries: MempoolEntry[],
    status: MempoolEntryStatus,
    params?: {
        transaction?: string;
        revertReason?: string;
    }
) {
    parentPort!.postMessage({
        updateStatus: {
            entries,
            status,
            params,
        },
    });
}

parentPort!.on("message", async () => {
    let result = await asyncFunction(workerData);
    log("Worker finished");
    parentPort!.postMessage({ result: result });
});

async function asyncFunction(data: any): Promise<any> {
    try {
        log("Worker started");
        const { entries, privateKey } = data;

        if (!entries.length) {
            log("No new entries");
            return;
        }

        const relayer = new ethers.Wallet(privateKey, provider);

        const gasFee = await getGasFee(chainId, provider, "");

        if (gasFee.gasPrice == undefined && gasFee.maxFeePerGas == undefined && gasFee.maxPriorityFeePerGas == undefined) {
            return;
        }
        log(" create Bundler");
        const bundle = await createBundle(gasFee, entries, provider);

        //await mempoolService.updateStatus(bundle.entries, MempoolEntryStatus.Pending);

        //await mempoolService.attemptToBundle(bundle.entries);

        //relayer send transaction

        const { entries: bundleEntries } = bundle;

        const wallet = new ethers.Wallet(privateKey, provider);

        const beneficiary = await wallet.getAddress();

        const entryPoint = bundleEntries[0]!.entryPoint;

        const entryPointContract = IEntryPoint__factory.connect(entryPoint, provider);

        const txRequest = entryPointContract.interface.encodeFunctionData("handleOps", [bundleEntries.map((entry) => entry.userOp), beneficiary]);

        const transactionRequest: providers.TransactionRequest = {
            to: entryPoint,
            data: txRequest,
            gasPrice: 100e9,
        };

        const transaction = {
            ...transactionRequest,
            gasLimit: estimateBundleGasLimit(bundleGasLimitMarkup, bundle.entries),
            chainId: provider._network.chainId,
            nonce: await relayer.getTransactionCount(),
        };

        return await submitTransaction(relayer, transaction)
            .then(async (hash) => {
                log("Transaction hash: " + hash);
                return {
                    success: true,
                    hash: hash,
                };
            })
            .catch(async (error) => {
                logError("Transaction error: " + error);
                return {
                    success: false,
                    error: error,
                };
            });
    } catch (error) {
        return {
            success: false,
            error: error,
        };
    }
}

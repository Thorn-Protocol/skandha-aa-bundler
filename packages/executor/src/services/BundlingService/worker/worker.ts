import { Logger } from "types/lib";
import * as wk from "worker_threads";
import { MempoolService } from "../../MempoolService";
import { MempoolEntryStatus } from "types/lib/executor";
import { IRelayingMode } from "../interfaces";

export function runService(workerData: any, logger: Logger, mempoolService: MempoolService, idRelayer: number, relayer: IRelayingMode) {
    return new Promise((resolve, reject) => {
        const worker = new wk.Worker("./packages/executor/lib/services/BundlingService/worker/WorkerMission.js", { workerData });
        worker.on("message", async (message) => {
            // send log from child thread
            if (message.log) {
                logger.debug(` 😵 Worker log:${message.log}`);
            }
            //action update status
            if (message.updateStatus) {
                const { entries, status, params } = message.updateStatus;
                await mempoolService.updateStatus(entries, status, params);
            }
            // result thread
            if (message.result) {
                const { success } = message.result;
                if (success) {
                    // send bundler success
                    const { hash } = message.result;
                    await mempoolService.updateStatus(workerData.entries, MempoolEntryStatus.Finalized);
                    await relayer.setSubmitted(workerData.entries, hash);
                } else {
                    // send bundler failed
                    const { error } = message.result;
                    await relayer.handleUserOpFail(workerData.entries, error);
                }
                relayer.unlockRelayer(idRelayer);
                resolve(message.result);
            }
        });

        worker.on("error", () => {
            relayer.unlockRelayer(idRelayer);
            reject;
        });

        worker.on("exit", (code) => {
            relayer.unlockRelayer(idRelayer);
            if (code !== 0) {
                relayer.unlockRelayer(idRelayer);
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });

        worker.postMessage(workerData);
    });
}

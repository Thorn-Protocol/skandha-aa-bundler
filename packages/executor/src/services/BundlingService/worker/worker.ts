import { Logger } from "types/lib";
import * as wk from "worker_threads";
import { MempoolService } from "../../MempoolService";
import { MempoolEntryStatus } from "types/lib/executor";
import { IRelayingMode } from "../interfaces";

export function runService(workerData: any, logger: Logger, mempoolService: MempoolService, idRelayer: number, relayer: IRelayingMode) {
  return new Promise((resolve, reject) => {
    const worker = new wk.Worker("./packages/executor/lib/services/BundlingService/worker/WorkerMission.js", { workerData });
    worker.on("message", async (message) => {
      if (message.log) {
        logger.debug(` 😵 Worker log:${message.log}`);
      } else if (message.result) {
        const hash = message.result;
        await mempoolService.updateStatus(workerData.entries, MempoolEntryStatus.Finalized);
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

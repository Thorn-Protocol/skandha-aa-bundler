import { BigNumber } from "ethers";
import * as wk from "worker_threads";
import { Bundle, UserOpValidationResult } from "../../interfaces";
import { chainsWithoutEIP1559, GasPriceMarkupOne } from "params/lib";
import { IGetGasFeeResult } from "params/lib/gas-price-oracles/oracles";
import { ReputationStatus, MempoolEntryStatus } from "types/lib/executor";
import { IEntryPoint__factory } from "types/lib/executor/contracts";
import { MempoolEntry } from "../../entities/MempoolEntry";
import { getAddr } from "../../utils";
import { getUserOpGasLimit } from "./utils";

export function runService(workerData: any) {
  return new Promise((resolve, reject) => {
    const worker = new wk.Worker("./WorkerMission", { workerData });
    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

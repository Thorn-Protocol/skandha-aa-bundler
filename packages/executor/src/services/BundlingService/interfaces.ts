import { Wallet, providers } from "ethers";
import { Bundle } from "../../interfaces";
import { MempoolEntry } from "../../entities/MempoolEntry";

export type Relayer = Wallet | providers.JsonRpcSigner;

export interface IRelayingMode {
  isLocked(): boolean;
  sendBundle(bundle: Bundle): Promise<void>;
  getAvailableRelayersCount(): number;
  canSubmitBundle(): Promise<boolean>;
  getAvailableRelayersAndLockIt(): Relayer[];
  getAvailableRelayerIndex(): number | null;
  getPrivateKey(number: number): string;
  lockRelayer(index: number): void;
  unlockRelayer(index: number): void;
  handleUserOpFail(entries: MempoolEntry[], err: any): Promise<void>;
  setSubmitted(entries: MempoolEntry[], transaction: string): Promise<void>;
}

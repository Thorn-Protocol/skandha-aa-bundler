import { Wallet, providers } from "ethers";
import { Bundle } from "../../interfaces";

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
}

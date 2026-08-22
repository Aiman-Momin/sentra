/**
 * Detection Engine — type contracts.
 *
 * The engine NEVER talks to a blockchain, an RPC provider, or a database.
 * It takes normalized transfer activity for a single wallet and returns a
 * risk assessment. This makes it fully unit-testable without any network
 * access, and keeps blockchain access / persistence out of the core logic.
 */

export type AssetSymbol = string; // e.g. "USDT", "MATIC", "USDC"

/**
 * One normalized value transfer touching the analyzed wallet.
 * "Normalized" means: already decoded from raw chain logs/tx receipts into
 * a single direction (in/out), a single asset, and a single counterparty,
 * by the blockchain layer (see backend/src/blockchain).
 */
export interface NormalizedTransfer {
  /** on-chain tx hash */
  txHash: string;
  /** unix seconds, from block timestamp */
  timestamp: number;
  /** block number, used for ordering ties and confidence */
  blockNumber: number;
  direction: "IN" | "OUT";
  asset: AssetSymbol;
  /** decimal-adjusted amount as a string to avoid float precision loss */
  amount: string;
  /** the other party in this transfer */
  counterparty: string;
  /** true if `asset` is the chain's native gas token (e.g. MATIC on Polygon) */
  isNativeAsset: boolean;
}

export interface WalletActivity {
  address: string;
  network: string;
  /** all normalized transfers touching this wallet, any order — engine sorts internally */
  transfers: NormalizedTransfer[];
  /** unix seconds this snapshot of activity was fetched, for staleness display */
  fetchedAt: number;
}

export type RiskLevel =
  | "NORMAL"
  | "SUSPICIOUS"
  | "HIGH_RISK"
  | "ACTIVE_SWEEPER_LIKELY";

export type SignalId =
  | "FAST_DRAIN"
  | "REPEATED_FAST_DRAIN"
  | "MULTI_ASSET_SWEEP"
  | "REPEATED_DESTINATION"
  | "GAS_FUNDING_THEN_DRAIN"
  | "CONSISTENT_DRAIN_TIMING"
  | "FULL_BALANCE_DRAIN";

export interface RiskSignal {
  id: SignalId;
  /** human-readable, shown to the end user as "why" */
  description: string;
  /** contribution to the overall score, 0-100 scale */
  weight: number;
  /** the specific transactions that produced this signal, for the evidence/timeline UI */
  evidenceTxHashes: string[];
}

export interface RiskResult {
  address: string;
  network: string;
  riskScore: number; // 0-100
  riskLevel: RiskLevel;
  recommendation: string;
  signals: RiskSignal[];
  /** full, time-ordered transfer list, for the timeline UI */
  timeline: NormalizedTransfer[];
  analyzedAt: number;
  /** true if there wasn't enough activity to say anything meaningful */
  insufficientData: boolean;
}

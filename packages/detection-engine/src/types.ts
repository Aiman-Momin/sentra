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
  | "FULL_BALANCE_DRAIN"
  | "KNOWN_SWEEPER_DESTINATION";

/**
 * Optional external knowledge the engine can be given, learned from past
 * assessments (see backend/src/services/learningService.ts). Passing this
 * in does NOT make the engine impure or network-dependent — it's just
 * data, computed by the caller ahead of time. An empty/omitted context
 * behaves identically to the engine having no memory at all.
 *
 * - knownSweeperDestinations: address (lowercase) -> confidence (0-1).
 *   Addresses Sentra has previously confirmed as sweeper drain
 *   destinations, on ANY wallet, not just this one. A single transfer to
 *   one of these is treated seriously even if it wasn't fast — the
 *   address itself is already incriminating.
 * - verifiedSafeAddresses: address (lowercase) set. Addresses a human
 *   has confirmed are legitimate (DEX routers, exchange hot wallets,
 *   etc.) after a false-positive report. Transfers to these are excluded
 *   from drain-pattern scoring entirely.
 */
export interface DetectionContext {
  knownSweeperDestinations?: Map<string, number>;
  verifiedSafeAddresses?: Set<string>;
}

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
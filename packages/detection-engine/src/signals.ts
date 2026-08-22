import type { NormalizedTransfer, RiskSignal } from "./types";

/**
 * Each detector is a pure function: (sorted transfers) -> RiskSignal | null.
 * "sorted" means ascending by (timestamp, blockNumber) — callers must sort first.
 *
 * Weights are additive contributions toward the 0-100 score. They are kept
 * here, next to the signal that produces them, so the reasoning is legible
 * and each one can be tuned independently as real-world data comes in.
 */

// This is the window a deposit and a later withdrawal are considered
// "possibly related" at all — generous on purpose. Whether that relation
// looks automated is then a matter of degree (see speedFactor), not a
// second hard cutoff. A drain 10 minutes after a deposit falls outside
// this window entirely and isn't paired.
const FAST_DRAIN_PAIRING_WINDOW_SECONDS = 300;
const GAS_FUNDING_WINDOW_SECONDS = 120;
const REPEATED_FAST_DRAIN_MIN_OCCURRENCES = 2;
const CONSISTENT_TIMING_STDDEV_THRESHOLD_SECONDS = 5;
const CONSISTENT_TIMING_MIN_OCCURRENCES = 3;

/**
 * Converts a deposit->drain gap into a 0-1 "how bot-like is this speed"
 * multiplier, tapering off smoothly instead of a hard yes/no cutoff.
 * A single arbitrary threshold (e.g. "30 seconds") means a 31-second
 * drain reads as completely clean and a 29-second one maxes out the
 * signal — that's brittle both ways. Real sweeper bots are typically
 * sub-10-second, but network/gas delays can push even a bot past that,
 * so this decays gradually rather than cutting off sharply.
 */
function speedFactor(gapSeconds: number): number {
  if (gapSeconds <= 10) return 1;
  if (gapSeconds <= 30) return 0.85;
  if (gapSeconds <= 60) return 0.6;
  if (gapSeconds <= 120) return 0.35;
  if (gapSeconds <= 300) return 0.15;
  return 0;
}

interface DepositDrainPair {
  deposit: NormalizedTransfer;
  drain: NormalizedTransfer;
  gapSeconds: number;
}

/**
 * Finds IN transfers that are followed by an OUT transfer of the same
 * asset within FAST_DRAIN_PAIRING_WINDOW_SECONDS. This is the atomic unit
 * most of the other signals build on. Being "paired" here doesn't by
 * itself mean risky — how much a pair contributes to the score depends on
 * speedFactor(gapSeconds).
 */
function findDepositDrainPairs(transfers: NormalizedTransfer[]): DepositDrainPair[] {
  const pairs: DepositDrainPair[] = [];
  const outsByAsset = new Map<string, NormalizedTransfer[]>();
  for (const t of transfers) {
    if (t.direction === "OUT") {
      const list = outsByAsset.get(t.asset) ?? [];
      list.push(t);
      outsByAsset.set(t.asset, list);
    }
  }

  for (const deposit of transfers) {
    if (deposit.direction !== "IN") continue;
    const candidateOuts = outsByAsset.get(deposit.asset) ?? [];
    // earliest OUT strictly after this deposit, within the window
    let best: NormalizedTransfer | null = null;
    for (const out of candidateOuts) {
      if (out.timestamp < deposit.timestamp) continue;
      const gap = out.timestamp - deposit.timestamp;
      if (gap > FAST_DRAIN_PAIRING_WINDOW_SECONDS) continue;
      if (!best || out.timestamp < best.timestamp) best = out;
    }
    if (best) {
      pairs.push({ deposit, drain: best, gapSeconds: best.timestamp - deposit.timestamp });
    }
  }
  return pairs;
}

export function detectFastDrain(transfers: NormalizedTransfer[]): RiskSignal | null {
  const pairs = findDepositDrainPairs(transfers);
  if (pairs.length === 0) return null;
  // Use the fastest pair found — the strongest single piece of evidence.
  const fastest = pairs.reduce((a, b) => (a.gapSeconds <= b.gapSeconds ? a : b));
  const factor = speedFactor(fastest.gapSeconds);
  if (factor === 0) return null;
  return {
    id: "FAST_DRAIN",
    description: `Incoming ${fastest.deposit.asset} was moved out again ${fastest.gapSeconds}s after arriving.`,
    weight: Math.round(20 * factor),
    evidenceTxHashes: [fastest.deposit.txHash, fastest.drain.txHash],
  };
}

export function detectRepeatedFastDrain(transfers: NormalizedTransfer[]): RiskSignal | null {
  const pairs = findDepositDrainPairs(transfers).filter((p) => speedFactor(p.gapSeconds) > 0);
  if (pairs.length < REPEATED_FAST_DRAIN_MIN_OCCURRENCES) return null;
  const avgFactor = pairs.reduce((sum, p) => sum + speedFactor(p.gapSeconds), 0) / pairs.length;
  const evidence = pairs.flatMap((p) => [p.deposit.txHash, p.drain.txHash]);
  return {
    id: "REPEATED_FAST_DRAIN",
    description: `Deposit-then-drain pattern occurred ${pairs.length} times, consistently fast.`,
    weight: Math.round(30 * avgFactor),
    evidenceTxHashes: evidence,
  };
}

export function detectMultiAssetSweep(transfers: NormalizedTransfer[]): RiskSignal | null {
  const pairs = findDepositDrainPairs(transfers);
  const assets = new Set(pairs.map((p) => p.deposit.asset));
  if (assets.size < 2) return null;
  const evidence = pairs.flatMap((p) => [p.deposit.txHash, p.drain.txHash]);
  return {
    id: "MULTI_ASSET_SWEEP",
    description: `Fast drains observed across ${assets.size} different assets (${[...assets].join(", ")}).`,
    weight: 15,
    evidenceTxHashes: evidence,
  };
}

export function detectRepeatedDestination(transfers: NormalizedTransfer[]): RiskSignal | null {
  const pairs = findDepositDrainPairs(transfers);
  const destCounts = new Map<string, NormalizedTransfer[]>();
  for (const p of pairs) {
    const list = destCounts.get(p.drain.counterparty) ?? [];
    list.push(p.drain);
    destCounts.set(p.drain.counterparty, list);
  }
  const repeated = [...destCounts.entries()].filter(([, drains]) => drains.length >= 2);
  if (repeated.length === 0) return null;
  const [destination, drains] = repeated.sort((a, b) => b[1].length - a[1].length)[0];
  return {
    id: "REPEATED_DESTINATION",
    description: `Drained funds repeatedly sent to the same address (${drains.length}x): ${destination}.`,
    weight: 20,
    evidenceTxHashes: drains.map((d) => d.txHash),
  };
}

/**
 * Sweeper bots often need native gas token funded into a wallet before they
 * can move an ERC-20 out (to pay gas). A small native-token IN followed
 * shortly by a token OUT is a strong tell.
 */
export function detectGasFundingThenDrain(transfers: NormalizedTransfer[]): RiskSignal | null {
  const nativeDeposits = transfers.filter((t) => t.direction === "IN" && t.isNativeAsset);
  if (nativeDeposits.length === 0) return null;

  for (const gasDeposit of nativeDeposits) {
    const followingDrain = transfers.find(
      (t) =>
        t.direction === "OUT" &&
        !t.isNativeAsset &&
        t.timestamp >= gasDeposit.timestamp &&
        t.timestamp - gasDeposit.timestamp <= GAS_FUNDING_WINDOW_SECONDS
    );
    if (followingDrain) {
      return {
        id: "GAS_FUNDING_THEN_DRAIN",
        description: `Wallet received gas funding, then drained a token shortly after — a classic sweeper-bot funding pattern.`,
        weight: 20,
        evidenceTxHashes: [gasDeposit.txHash, followingDrain.txHash],
      };
    }
  }
  return null;
}

export function detectConsistentDrainTiming(transfers: NormalizedTransfer[]): RiskSignal | null {
  const pairs = findDepositDrainPairs(transfers);
  if (pairs.length < CONSISTENT_TIMING_MIN_OCCURRENCES) return null;
  const gaps = pairs.map((p) => p.gapSeconds);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length;
  const stddev = Math.sqrt(variance);
  if (stddev > CONSISTENT_TIMING_STDDEV_THRESHOLD_SECONDS) return null;
  const evidence = pairs.flatMap((p) => [p.deposit.txHash, p.drain.txHash]);
  return {
    id: "CONSISTENT_DRAIN_TIMING",
    description: `Drain timing is highly consistent (~${mean.toFixed(1)}s after deposit, stddev ${stddev.toFixed(1)}s) — consistent with automated bot behavior.`,
    weight: 15,
    evidenceTxHashes: evidence,
  };
}

/**
 * If a drain's amount is (approximately) equal to the deposit amount, the
 * whole balance is being swept, not just an unrelated withdrawal.
 */
export function detectFullBalanceDrain(transfers: NormalizedTransfer[]): RiskSignal | null {
  const pairs = findDepositDrainPairs(transfers);
  const fullDrains = pairs.filter((p) => {
    const depositAmt = parseFloat(p.deposit.amount);
    const drainAmt = parseFloat(p.drain.amount);
    if (depositAmt <= 0) return false;
    return Math.abs(depositAmt - drainAmt) / depositAmt <= 0.02; // within 2%
  });
  if (fullDrains.length === 0) return null;
  const evidence = fullDrains.flatMap((p) => [p.deposit.txHash, p.drain.txHash]);
  return {
    id: "FULL_BALANCE_DRAIN",
    description: `Deposited amount was drained almost in full (within 2%) rather than partially spent.`,
    weight: 10,
    evidenceTxHashes: evidence,
  };
}

export const ALL_DETECTORS = [
  detectFastDrain,
  detectRepeatedFastDrain,
  detectMultiAssetSweep,
  detectRepeatedDestination,
  detectGasFundingThenDrain,
  detectConsistentDrainTiming,
  detectFullBalanceDrain,
];

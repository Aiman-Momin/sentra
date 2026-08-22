import { ALL_DETECTORS } from "./signals";
import type { RiskLevel, RiskResult, RiskSignal, WalletActivity } from "./types";

const MIN_TRANSFERS_FOR_ANALYSIS = 1;

/**
 * Score -> level mapping. A single weak signal should not read as
 * "ACTIVE_SWEEPER_LIKELY" — that label is reserved for wallets where
 * multiple independent signals agree. But any genuine signal at all
 * (score > 0) means something worth surfacing was found — it shouldn't
 * silently collapse into "NORMAL" just because it's the only one, or
 * because the deposit->drain gap was on the slower end. NORMAL is
 * reserved for wallets where nothing was detected at all.
 */
function scoreToLevel(score: number, signalCount: number): RiskLevel {
  if (score >= 70 && signalCount >= 2) return "ACTIVE_SWEEPER_LIKELY";
  if (score >= 50) return "HIGH_RISK";
  if (score > 0) return "SUSPICIOUS";
  return "NORMAL";
}

function recommendationFor(level: RiskLevel): string {
  switch (level) {
    case "ACTIVE_SWEEPER_LIKELY":
      return "DO NOT SEND FUNDS. This wallet shows strong evidence of an active sweeper bot.";
    case "HIGH_RISK":
      return "Sending is not recommended. This wallet shows multiple signs of automated draining.";
    case "SUSPICIOUS":
      return "Proceed with caution. Some unusual activity was detected on this wallet.";
    case "NORMAL":
      return "No sweeper-bot behavior detected in this wallet's recent activity.";
  }
}

/**
 * Core entry point. Pure function of WalletActivity -> RiskResult.
 * No I/O, no randomness, no wall-clock reads except for `analyzedAt`
 * (injectable via `now` for deterministic tests).
 */
export function analyzeWallet(activity: WalletActivity, now: () => number = () => Date.now() / 1000): RiskResult {
  const sorted = [...activity.transfers].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return a.blockNumber - b.blockNumber;
  });

  if (sorted.length < MIN_TRANSFERS_FOR_ANALYSIS) {
    return {
      address: activity.address,
      network: activity.network,
      riskScore: 0,
      riskLevel: "NORMAL",
      recommendation: "No on-chain activity found for this wallet yet. Insufficient data to assess risk.",
      signals: [],
      timeline: sorted,
      analyzedAt: now(),
      insufficientData: true,
    };
  }

  const signals: RiskSignal[] = [];
  for (const detect of ALL_DETECTORS) {
    const signal = detect(sorted);
    if (signal) signals.push(signal);
  }

  const rawScore = signals.reduce((sum, s) => sum + s.weight, 0);
  const riskScore = Math.max(0, Math.min(100, Math.round(rawScore)));
  const riskLevel = scoreToLevel(riskScore, signals.length);

  return {
    address: activity.address,
    network: activity.network,
    riskScore,
    riskLevel,
    recommendation: recommendationFor(riskLevel),
    signals,
    timeline: sorted,
    analyzedAt: now(),
    insufficientData: false,
  };
}

export * from "./types";
export * from "./signals";

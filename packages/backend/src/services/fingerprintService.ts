import type { NormalizedTransfer, RiskResult } from "@sentra/detection-engine";
import { prisma } from "./riskService.js";

/**
 * Sweeper fingerprinting: rule-based behavioral similarity matching
 * across confirmed sweeps. NOT a trained ML model — every clustering
 * decision here is a transparent weighted-sum of a handful of measurable
 * dimensions, tunable and fully explainable. This is complementary to
 * (not a replacement for) the address-level learning in
 * learningService.ts: that breaks the moment an attacker rotates to a
 * fresh destination wallet, while this recognizes the same operator by
 * HOW they drain — timing, assets, drain percentage, gas-funding
 * behavior, active hours — which survives that rotation.
 *
 * Honest scope note: the feature vector below is built entirely from
 * what NormalizedTransfer actually captures (timestamps, assets,
 * amounts, direction, counterparty). It does NOT include on-chain
 * transaction structure (calldata, method selectors, multi-hop tracing
 * through the destination's own subsequent transfers) — that data isn't
 * collected by the current blockchain layer. If that's added later, it
 * would slot in as additional feature-vector dimensions here without
 * needing to change how fingerprints are matched/stored.
 */

const FINGERPRINT_MIN_RISK_LEVELS = new Set(["HIGH_RISK", "ACTIVE_SWEEPER_LIKELY"]);
const PAIRING_WINDOW_SECONDS = 300;
const SIMILARITY_THRESHOLD = 0.72;

interface FeatureVector {
  network: string;
  avgDrainDelaySeconds: number;
  avgDrainPercentage: number;
  assets: string[];
  gasFunded: boolean;
  hoursUtc: number[];
}

interface DepositDrainPair {
  deposit: NormalizedTransfer;
  drain: NormalizedTransfer;
  gapSeconds: number;
}

// Mirrors the detection engine's own pairing logic at a conceptual level
// (same 5-minute window), kept as a small local copy rather than an
// import — this is a different concern (feature extraction for
// clustering, not risk scoring) and shouldn't be coupled to the engine's
// internals changing.
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
    const candidates = outsByAsset.get(deposit.asset) ?? [];
    let best: NormalizedTransfer | null = null;
    for (const out of candidates) {
      if (out.timestamp < deposit.timestamp) continue;
      const gap = out.timestamp - deposit.timestamp;
      if (gap > PAIRING_WINDOW_SECONDS) continue;
      if (!best || out.timestamp < best.timestamp) best = out;
    }
    if (best) pairs.push({ deposit, drain: best, gapSeconds: best.timestamp - deposit.timestamp });
  }
  return pairs;
}

function extractFeatureVector(result: RiskResult): FeatureVector | null {
  const pairs = findDepositDrainPairs(result.timeline);
  if (pairs.length === 0) return null;

  const gaps = pairs.map((p) => p.gapSeconds);
  const avgDrainDelaySeconds = gaps.reduce((a, b) => a + b, 0) / gaps.length;

  const percentages: number[] = [];
  for (const p of pairs) {
    const depositAmt = parseFloat(p.deposit.amount);
    const drainAmt = parseFloat(p.drain.amount);
    if (depositAmt > 0 && Number.isFinite(drainAmt)) {
      percentages.push(Math.min(100, (drainAmt / depositAmt) * 100));
    }
  }
  const avgDrainPercentage =
    percentages.length > 0 ? percentages.reduce((a, b) => a + b, 0) / percentages.length : 0;

  const assets = [...new Set(pairs.map((p) => p.deposit.asset))];
  const hoursUtc = [...new Set(pairs.map((p) => new Date(p.drain.timestamp * 1000).getUTCHours()))];
  const gasFunded = result.signals.some((s) => s.id === "GAS_FUNDING_THEN_DRAIN");

  return { network: result.network, avgDrainDelaySeconds, avgDrainPercentage, assets, gasFunded, hoursUtc };
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function hourSimilarity(hours: number[], fingerprintHours: number[]): number {
  if (hours.length === 0 || fingerprintHours.length === 0) return 0;
  const scores = hours.map((hour) => {
    const nearestDistance = Math.min(
      ...fingerprintHours.map((candidate) => {
        const distance = Math.abs(hour - candidate);
        return Math.min(distance, 24 - distance);
      })
    );
    return 1 - Math.min(1, nearestDistance / 12);
  });
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

interface FingerprintAggregate {
  avgDrainDelaySeconds: number;
  avgDrainPercentage: number;
  preferredAssets: unknown;
  gasFundingRatio: number;
  activeHoursUtc: unknown;
}

/**
 * Weighted similarity, 0-1. Weights are a starting point, not a tuned
 * model — timing gets the most weight since it's the hardest thing for
 * an attacker to vary without slowing their bot down, which somewhat
 * defeats the point of running one.
 */
function similarity(fv: FeatureVector, fp: FingerprintAggregate): number {
  const delayScore = 1 - Math.min(1, Math.abs(fv.avgDrainDelaySeconds - fp.avgDrainDelaySeconds) / 60);
  const pctScore = 1 - Math.min(1, Math.abs(fv.avgDrainPercentage - fp.avgDrainPercentage) / 20);
  const assetScore = jaccard(fv.assets, fp.preferredAssets as string[]);
  const gasScore = 1 - Math.abs((fv.gasFunded ? 1 : 0) - fp.gasFundingRatio);
  const hourScore = hourSimilarity(fv.hoursUtc, fp.activeHoursUtc as number[]);
  return 0.35 * delayScore + 0.25 * pctScore + 0.25 * assetScore + 0.1 * gasScore + 0.05 * hourScore;
}

async function nextLabel(): Promise<string> {
  const count = await prisma.sweeperFingerprint.count();
  return `SC-${String(count + 1).padStart(3, "0")}`;
}

export interface FingerprintMatchResult {
  fingerprintId: string;
  label: string;
  similarity: number;
  victimCount: number;
  isNewFingerprint: boolean;
}

/**
 * Called after every HIGH_RISK/ACTIVE_SWEEPER_LIKELY assessment. Extracts
 * a feature vector from the confirmed sweep, compares it against every
 * existing fingerprint on the same network, and either joins the
 * best-matching one (if similarity clears the threshold) or starts a new
 * one. Returns null for anything below HIGH_RISK, or where there's no
 * usable deposit->drain pair to build a feature vector from.
 */
export async function fingerprintAssessment(
  result: RiskResult,
  assessmentId: string
): Promise<FingerprintMatchResult | null> {
  if (!FINGERPRINT_MIN_RISK_LEVELS.has(result.riskLevel)) return null;

  const fv = extractFeatureVector(result);
  if (!fv) return null;

  const candidates = await prisma.sweeperFingerprint.findMany({ where: { network: fv.network } });

  let best: { fp: (typeof candidates)[number]; score: number } | null = null;
  for (const fp of candidates) {
    const score = similarity(fv, fp);
    if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) {
      best = { fp, score };
    }
  }

  let fingerprint;
  let isNewFingerprint = false;

  if (best) {
    const fp = best.fp;
    const n = fp.sampleCount;
    const updatedAssets = [...new Set([...(fp.preferredAssets as string[]), ...fv.assets])];
    const updatedHours = [...new Set([...(fp.activeHoursUtc as number[]), ...fv.hoursUtc])];
    fingerprint = await prisma.sweeperFingerprint.update({
      where: { id: fp.id },
      data: {
        avgDrainDelaySeconds: fp.avgDrainDelaySeconds + (fv.avgDrainDelaySeconds - fp.avgDrainDelaySeconds) / (n + 1),
        avgDrainPercentage: fp.avgDrainPercentage + (fv.avgDrainPercentage - fp.avgDrainPercentage) / (n + 1),
        gasFundingRatio: fp.gasFundingRatio + ((fv.gasFunded ? 1 : 0) - fp.gasFundingRatio) / (n + 1),
        preferredAssets: updatedAssets,
        activeHoursUtc: updatedHours,
        sampleCount: { increment: 1 },
      },
    });
  } else {
    const label = await nextLabel();
    fingerprint = await prisma.sweeperFingerprint.create({
      data: {
        label,
        network: fv.network,
        avgDrainDelaySeconds: fv.avgDrainDelaySeconds,
        avgDrainPercentage: fv.avgDrainPercentage,
        gasFundingRatio: fv.gasFunded ? 1 : 0,
        preferredAssets: fv.assets,
        activeHoursUtc: fv.hoursUtc,
        sampleCount: 1,
      },
    });
    isNewFingerprint = true;
  }

  await prisma.sweeperFingerprintMatch.upsert({
    where: {
      fingerprintId_address_network: {
        fingerprintId: fingerprint.id,
        address: result.address.toLowerCase(),
        network: result.network,
      },
    },
    create: {
      fingerprintId: fingerprint.id,
      assessmentId,
      address: result.address.toLowerCase(),
      network: result.network,
      similarityScore: best ? best.score : 1,
    },
    update: {
      assessmentId,
      similarityScore: best ? best.score : 1,
      matchedAt: new Date(),
    },
  });

  const victimCount = await prisma.sweeperFingerprintMatch.count({ where: { fingerprintId: fingerprint.id } });

  return {
    fingerprintId: fingerprint.id,
    label: fingerprint.label,
    similarity: best ? best.score : 1,
    victimCount,
    isNewFingerprint,
  };
}

export async function listFingerprints() {
  const fingerprints = await prisma.sweeperFingerprint.findMany({ orderBy: { lastSeenAt: "desc" } });
  return Promise.all(
    fingerprints.map(async (fp: (typeof fingerprints)[number]) => ({
      ...fp,
      victimCount: await prisma.sweeperFingerprintMatch.count({ where: { fingerprintId: fp.id } }),
    }))
  );
}

export async function getFingerprint(id: string) {
  const fp = await prisma.sweeperFingerprint.findUniqueOrThrow({ where: { id } });
  const matches = await prisma.sweeperFingerprintMatch.findMany({
    where: { fingerprintId: id },
    orderBy: { matchedAt: "desc" },
  });
  return { ...fp, matches };
}
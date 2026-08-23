import { PrismaClient } from "@prisma/client";
import { analyzeWallet } from "@sentra/detection-engine";
import type { RiskResult } from "@sentra/detection-engine";
import { fetchWalletActivity } from "../blockchain/provider.js";
import { getDetectionContext, learnFromAssessment } from "./learningService.js";
import { fingerprintAssessment, type FingerprintMatchResult } from "./fingerprintService.js";

const prisma = new PrismaClient();

export interface RiskResultWithId extends RiskResult {
  /** id of the persisted RiskAssessment row — pass this to POST /api/feedback */
  assessmentId: string;
  /** set only for HIGH_RISK/ACTIVE_SWEEPER_LIKELY results with a usable
   * behavioral signature — null if no fingerprint could be extracted, or
   * the risk level didn't warrant one */
  fingerprint: FingerprintMatchResult | null;
}

/**
 * Full pipeline for a single wallet check:
 * real RPC fetch -> normalize -> [learned context] -> detection engine
 * -> persist -> [learn from this result] -> [fingerprint this result] -> return.
 *
 * This is the one function both the API route and the monitoring cron job
 * call, so "check a wallet right now" and "re-check a monitored wallet"
 * always go through identical logic.
 *
 * Note: this file, learningService.ts, and fingerprintService.ts import
 * from each other (they need `prisma`, this file needs their exported
 * functions). That's safe here — all of them only use the imported
 * bindings inside function bodies invoked after the whole module graph
 * has finished loading (i.e. once an actual request comes in), never at
 * module top-level, which is exactly the case ESM's live-binding
 * circular-import handling is designed for.
 */
export async function checkWallet(address: string, network: string): Promise<RiskResultWithId> {
  const activity = await fetchWalletActivity(address, network);
  const context = await getDetectionContext(network);
  
  console.log(`[risk] [${network}] checking ${address}`);
  console.log(`[risk] [${network}] detection context: ${context.knownSweeperDestinations?.size ?? 0} known sweeper destinations, ${context.verifiedSafeAddresses?.size ?? 0} verified safe`);
  console.log(`[risk] [${network}] wallet activity: ${activity.transfers.length} transfers`);
  
  const result = analyzeWallet(activity, context);
  
  console.log(`[risk] [${network}] result: score=${result.riskScore}, level=${result.riskLevel}, signals=${result.signals.length}`);
  for (const signal of result.signals) {
    console.log(`[risk] [${network}]   - ${signal.id} (weight=${signal.weight}, evidence=${signal.evidenceTxHashes.length} txs)`);
  }

  const created = await prisma.riskAssessment.create({
    data: {
      address: result.address,
      network: result.network,
      riskScore: result.riskScore,
      riskLevel: result.riskLevel,
      recommendation: result.recommendation,
      signals: result.signals as any,
      timeline: result.timeline as any,
      insufficientData: result.insufficientData,
      analyzedAt: new Date(result.analyzedAt * 1000),
    },
  });

  // Learning/fingerprinting failures should never break the actual risk
  // check the caller is waiting on — log and move on.
  try {
    await learnFromAssessment(result);
  } catch (err) {
    console.error("[learning] failed to learn from assessment:", err);
  }

  let fingerprint: FingerprintMatchResult | null = null;
  try {
    fingerprint = await fingerprintAssessment(result, created.id);
  } catch (err) {
    console.error("[fingerprint] failed to fingerprint assessment:", err);
  }

  return { ...result, assessmentId: created.id, fingerprint };
}

export async function getAssessmentHistory(address: string, network: string, limit = 20) {
  return prisma.riskAssessment.findMany({
    where: { address, network },
    orderBy: { analyzedAt: "desc" },
    take: limit,
  });
}

export { prisma };
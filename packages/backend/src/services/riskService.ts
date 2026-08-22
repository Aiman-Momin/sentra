import { PrismaClient } from "@prisma/client";
import { analyzeWallet } from "@sentra/detection-engine";
import type { RiskResult } from "@sentra/detection-engine";
import { fetchWalletActivity } from "../blockchain/provider.js";

const prisma = new PrismaClient();

/**
 * Full pipeline for a single wallet check:
 * real RPC fetch -> normalize -> detection engine -> persist -> return.
 *
 * This is the one function both the API route and the monitoring cron job
 * call, so "check a wallet right now" and "re-check a monitored wallet"
 * always go through identical logic.
 */
export async function checkWallet(address: string, network: string): Promise<RiskResult> {
  const activity = await fetchWalletActivity(address, network);
  const result = analyzeWallet(activity);

  await prisma.riskAssessment.create({
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

  return result;
}

export async function getAssessmentHistory(address: string, network: string, limit = 20) {
  return prisma.riskAssessment.findMany({
    where: { address, network },
    orderBy: { analyzedAt: "desc" },
    take: limit,
  });
}

export { prisma };

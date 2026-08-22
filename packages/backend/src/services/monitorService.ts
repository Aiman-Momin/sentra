import { prisma, checkWallet } from "./riskService.js";
import type { RiskResult } from "@sentra/detection-engine";

export async function addMonitoredWallet(address: string, network: string, label?: string) {
  return prisma.monitoredWallet.upsert({
    where: { address_network: { address, network } },
    update: { label },
    create: { address, network, label },
  });
}

export async function listMonitoredWallets() {
  return prisma.monitoredWallet.findMany({ orderBy: { createdAt: "desc" } });
}

export async function removeMonitoredWallet(id: string) {
  return prisma.monitoredWallet.delete({ where: { id } });
}

/**
 * Re-checks one monitored wallet against real chain data and raises an
 * Alert row if its situation got worse since the last check. Called by
 * the cron job in jobs/monitor.ts, and also usable ad hoc.
 */
export async function recheckMonitoredWallet(walletId: string): Promise<RiskResult> {
  const wallet = await prisma.monitoredWallet.findUniqueOrThrow({ where: { id: walletId } });
  const previousScore = wallet.lastRiskScore;
  const previousLevel = wallet.lastRiskLevel;

  const result = await checkWallet(wallet.address, wallet.network);

  await prisma.monitoredWallet.update({
    where: { id: walletId },
    data: {
      lastCheckedAt: new Date(),
      lastRiskScore: result.riskScore,
      lastRiskLevel: result.riskLevel,
    },
  });

  const newFastDrain = result.signals.find((s) => s.id === "FAST_DRAIN" || s.id === "REPEATED_FAST_DRAIN");
  const hadFastDrainBefore = previousLevel === "HIGH_RISK" || previousLevel === "ACTIVE_SWEEPER_LIKELY";

  if (newFastDrain && !hadFastDrainBefore) {
    await prisma.alert.create({
      data: {
        monitoredWalletId: walletId,
        type: "FAST_DRAIN_DETECTED",
        message: `New deposit-then-drain activity detected on ${wallet.label ?? wallet.address}.`,
        previousScore: previousScore ?? undefined,
        newScore: result.riskScore,
      },
    });
  }

  if (previousScore !== null && previousScore !== undefined && result.riskScore > previousScore + 10) {
    await prisma.alert.create({
      data: {
        monitoredWalletId: walletId,
        type: "RISK_SCORE_INCREASED",
        message: `Risk score increased from ${previousScore} to ${result.riskScore}.`,
        previousScore,
        newScore: result.riskScore,
      },
    });
  }

  const repeatedDestSignal = result.signals.find((s) => s.id === "REPEATED_DESTINATION");
  if (repeatedDestSignal && (!previousLevel || previousLevel === "NORMAL" || previousLevel === "SUSPICIOUS")) {
    await prisma.alert.create({
      data: {
        monitoredWalletId: walletId,
        type: "NEW_REPEATED_DESTINATION",
        message: repeatedDestSignal.description,
        previousScore: previousScore ?? undefined,
        newScore: result.riskScore,
      },
    });
  }

  return result;
}

export async function recheckAllMonitoredWallets() {
  const wallets = await prisma.monitoredWallet.findMany();
  const results = [];
  for (const wallet of wallets) {
    try {
      const result = await recheckMonitoredWallet(wallet.id);
      results.push({ walletId: wallet.id, ok: true, result });
    } catch (err) {
      results.push({ walletId: wallet.id, ok: false, error: (err as Error).message });
    }
  }
  return results;
}

export async function listAlerts(monitoredWalletId?: string) {
  return prisma.alert.findMany({
    where: monitoredWalletId ? { monitoredWalletId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

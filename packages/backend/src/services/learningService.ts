import type { DetectionContext, NormalizedTransfer, RiskResult, RiskSignal } from "@sentra/detection-engine";
import { prisma } from "./riskService.js";

/**
 * This is Sentra's "learning" layer. It's deliberately NOT a black-box
 * model — it's a transparent, inspectable memory of two things:
 *   - addresses previously confirmed (by the engine's own scoring, or by
 *     a human) as sweeper collection points, so future assessments of
 *     OTHER wallets that drain to the same address start out already
 *     suspicious of it
 *   - addresses a human has manually confirmed are safe after a
 *     false-positive report, so the same legitimate pattern (e.g. a DEX
 *     router that receives and immediately forwards funds) doesn't keep
 *     re-triggering
 *
 * Both directions only ever act on this specific wallet-address level —
 * there's no hidden global model being retrained, just a growing,
 * auditable table any of these decisions can be traced back to.
 */

// Auto-learning only fires on assessments the engine is already
// confident about, and only for destinations that were drained to more
// than once WITHIN that single assessment — a single fast drain to a
// brand-new address isn't strong enough evidence on its own to promote
// that address into "known bad" for every other wallet going forward.
const AUTO_LEARN_MIN_RISK_LEVELS = new Set(["HIGH_RISK", "ACTIVE_SWEEPER_LIKELY"]);
const AUTO_LEARN_MIN_DESTINATION_OCCURRENCES = 2;
const AUTO_LEARN_INITIAL_CONFIDENCE = 0.6;
const AUTO_LEARN_CONFIDENCE_INCREMENT = 0.08;
const AUTO_LEARN_MAX_CONFIDENCE = 0.9; // manual confirmation can still exceed this
const MANUAL_CONFIDENCE = 0.95;

/**
 * Loads everything Sentra currently knows for a network, shaped as the
 * DetectionContext the pure engine expects. Called once per wallet check,
 * right before analyzeWallet — this is the only place the engine's
 * "memory" touches the database.
 */
export async function getDetectionContext(network: string): Promise<DetectionContext> {
  const known = await prisma.knownAddress.findMany({ where: { network } });

  const knownSweeperDestinations = new Map<string, number>();
  const verifiedSafeAddresses = new Set<string>();

  for (const entry of known) {
    const address = entry.address.toLowerCase();
    if (entry.classification === "SWEEPER_DESTINATION") {
      knownSweeperDestinations.set(address, entry.confidence);
    } else if (entry.classification === "VERIFIED_SAFE") {
      verifiedSafeAddresses.add(address);
    }
  }

  return { knownSweeperDestinations, verifiedSafeAddresses };
}

/**
 * Called after every wallet check. If the assessment is convincing
 * enough on its own (not relying on cross-wallet memory to get there),
 * any destination it drained to repeatedly gets remembered — so the
 * NEXT wallet that sends to that same address starts out already
 * flagged, even before it builds up its own repeated pattern.
 *
 * A manual classification (from a human's feedback) is never downgraded
 * by this — auto-learning only ever raises confidence on an
 * already-auto-learned entry, or creates a new one.
 */
export async function learnFromAssessment(result: RiskResult): Promise<void> {
  if (!AUTO_LEARN_MIN_RISK_LEVELS.has(result.riskLevel)) return;

  const destinationCounts = new Map<string, number>();
  for (const t of result.timeline) {
    if (t.direction !== "OUT") continue;
    const addr = t.counterparty.toLowerCase();
    destinationCounts.set(addr, (destinationCounts.get(addr) ?? 0) + 1);
  }

  let learnedCount = 0;
  for (const [address, count] of destinationCounts) {
    if (count < AUTO_LEARN_MIN_DESTINATION_OCCURRENCES) {
      console.log(`[learning] [${result.network}] address ${address} has ${count} occurrences (min required: ${AUTO_LEARN_MIN_DESTINATION_OCCURRENCES}), skipping`);
      continue;
    }

    const existing = await prisma.knownAddress.findUnique({
      where: { address_network: { address, network: result.network } },
    });

    // A manually-verified-safe address is never overwritten by
    // auto-learning, even if this specific assessment looked risky —
    // a human's explicit judgment takes precedence over the heuristic.
    if (existing?.source === "MANUAL") {
      console.log(`[learning] [${result.network}] address ${address} already manually classified as ${existing.classification}, skipping`);
      continue;
    }

    if (existing) {
      const newConfidence = Math.min(AUTO_LEARN_MAX_CONFIDENCE, existing.confidence + AUTO_LEARN_CONFIDENCE_INCREMENT);
      console.log(`[learning] [${result.network}] updating ${address} confidence: ${existing.confidence.toFixed(2)} -> ${newConfidence.toFixed(2)}`);
      await prisma.knownAddress.update({
        where: { id: existing.id },
        data: {
          classification: "SWEEPER_DESTINATION",
          occurrenceCount: { increment: 1 },
          confidence: newConfidence,
        },
      });
    } else {
      console.log(`[learning] [${result.network}] learning new sweeper destination: ${address} (${count} occurrences)`);
      await prisma.knownAddress.create({
        data: {
          address,
          network: result.network,
          classification: "SWEEPER_DESTINATION",
          confidence: AUTO_LEARN_INITIAL_CONFIDENCE,
          occurrenceCount: 1,
          source: "AUTO_LEARNED",
        },
      });
    }
  }
}

export type FeedbackVerdict = "FALSE_POSITIVE" | "CONFIRMED_SWEEPER";

/**
 * The human half of the feedback loop. Given a past assessment's ID and
 * a verdict, finds the destination address(es) that actually produced
 * the flagged signals (via the stored evidence tx hashes, cross-referenced
 * against the stored timeline) and updates their classification —
 * MANUAL source, so it can never be silently overridden by auto-learning
 * later.
 */
export async function submitFeedback(
  assessmentId: string,
  verdict: FeedbackVerdict
): Promise<{
  updatedAddresses: string[];
  fingerprints: { fingerprintId: string; label: string; victimCount: number }[];
}> {
  const assessment = await prisma.riskAssessment.findUniqueOrThrow({ where: { id: assessmentId } });

  const signals = assessment.signals as unknown as RiskSignal[];
  const timeline = assessment.timeline as unknown as NormalizedTransfer[];
  const evidenceTxHashes = new Set(signals.flatMap((s) => s.evidenceTxHashes));

  const involvedDestinations = new Set(
    timeline
      .filter((t) => t.direction === "OUT" && evidenceTxHashes.has(t.txHash))
      .map((t) => t.counterparty.toLowerCase())
  );

  const classification = verdict === "FALSE_POSITIVE" ? "VERIFIED_SAFE" : "SWEEPER_DESTINATION";

  for (const address of involvedDestinations) {
    await prisma.knownAddress.upsert({
      where: { address_network: { address, network: assessment.network } },
      create: {
        address,
        network: assessment.network,
        classification,
        confidence: MANUAL_CONFIDENCE,
        occurrenceCount: 1,
        source: "MANUAL",
        note: `From feedback on assessment ${assessmentId}`,
      },
      update: {
        classification,
        confidence: MANUAL_CONFIDENCE,
        source: "MANUAL",
        occurrenceCount: { increment: 1 },
        note: `From feedback on assessment ${assessmentId}`,
      },
    });
  }

  if (verdict === "CONFIRMED_SWEEPER") {
    await prisma.sweeperFingerprintMatch.updateMany({
      where: {
        address: assessment.address.toLowerCase(),
        network: assessment.network,
      },
      data: { confirmed: true },
    });
  }

  const walletFingerprints = await prisma.sweeperFingerprintMatch.findMany({
    where: { address: assessment.address.toLowerCase(), network: assessment.network },
    include: { fingerprint: true },
  });
  const fingerprints = await Promise.all(
    walletFingerprints.map(async (match) => ({
      fingerprintId: match.fingerprintId,
      label: match.fingerprint.label,
      victimCount: await prisma.sweeperFingerprintMatch.count({
        where: { fingerprintId: match.fingerprintId, confirmed: true },
      }),
    }))
  );

  return { updatedAddresses: [...involvedDestinations], fingerprints };
}
import { Router } from "express";
import { listFingerprints, getFingerprint } from "../services/fingerprintService.js";

export const fingerprintRouter = Router();

/**
 * All known sweeper behavioral fingerprints, most recently active first.
 * Each includes a live-computed victimCount (distinct wallets matched).
 */
fingerprintRouter.get("/fingerprints", async (_req, res) => {
  try {
    const fingerprints = await listFingerprints();
    return res.json(fingerprints);
  } catch (err) {
    console.error("[fingerprints] list failed:", err);
    return res.status(500).json({ error: "Failed to list fingerprints", message: (err as Error).message });
  }
});

/**
 * Detail view for one fingerprint — its aggregate behavioral profile plus
 * the full audit trail of which wallets matched it and when.
 */
fingerprintRouter.get("/fingerprints/:id", async (req, res) => {
  try {
    const fingerprint = await getFingerprint(req.params.id);
    return res.json(fingerprint);
  } catch (err) {
    return res.status(404).json({ error: "Fingerprint not found", message: (err as Error).message });
  }
});
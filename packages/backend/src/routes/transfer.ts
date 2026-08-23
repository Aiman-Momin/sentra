import { Router } from "express";
import { z } from "zod";
import { ethers } from "ethers";
import { checkWallet } from "../services/riskService.js";

export const transferRouter = Router();

const transferCheckSchema = z.object({
  senderWallet: z.string().refine(ethers.isAddress, "Sender must be a valid wallet address"),
  recipientWallet: z.string().refine(ethers.isAddress, "Recipient must be a valid wallet address"),
  network: z.string().min(1),
  asset: z.string().min(1),
  amount: z.string().refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, "Amount must be positive"),
});

/**
 * Policy: block the transfer if the recipient is HIGH_RISK or
 * ACTIVE_SWEEPER_LIKELY. This endpoint does not move any funds itself —
 * Sentra is non-custodial — it only returns an allow/block decision plus
 * the full evidence, which the sending application (wallet, exchange,
 * payroll system) is expected to honor before it executes the transfer.
 */
const BLOCKING_LEVELS = new Set(["HIGH_RISK", "ACTIVE_SWEEPER_LIKELY"]);

transferRouter.post("/check-transfer", async (req, res) => {
  const parsed = transferCheckSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }
  const { senderWallet, recipientWallet, network, asset, amount } = parsed.data;

  try {
    const risk = await checkWallet(recipientWallet, network);
    const blocked = BLOCKING_LEVELS.has(risk.riskLevel);

    return res.json({
      decision: blocked ? "BLOCK" : "ALLOW",
      senderWallet,
      recipientWallet,
      asset,
      amount,
      risk,
    });
  } catch (err) {
    console.error("[check-transfer] failed:", err);
    return res.status(502).json({ error: "Failed to evaluate transfer", message: (err as Error).message });
  }
});

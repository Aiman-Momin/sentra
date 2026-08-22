import { Router } from "express";
import { z } from "zod";
import { checkWallet, getAssessmentHistory } from "../services/riskService.js";

export const walletRouter = Router();

const checkSchema = z.object({
  address: z.string().min(1),
  network: z.string().min(1),
});

/**
 * Core product endpoint. Real chain data goes in, real risk result comes
 * out. No caching of fake results, no shortcut — every call fetches
 * current on-chain activity via the blockchain provider.
 */
walletRouter.post("/check-recipient", async (req, res) => {
  const parsed = checkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }
  const { address, network } = parsed.data;

  try {
    const result = await checkWallet(address, network);
    return res.json(result);
  } catch (err) {
    console.error("[check-recipient] failed:", err);
    return res.status(502).json({
      error: "Failed to analyze wallet",
      message: (err as Error).message,
    });
  }
});

walletRouter.get("/history/:network/:address", async (req, res) => {
  const { network, address } = req.params;
  const history = await getAssessmentHistory(address, network);
  return res.json(history);
});

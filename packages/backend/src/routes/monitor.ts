import { Router } from "express";
import { z } from "zod";
import {
  addMonitoredWallet,
  listMonitoredWallets,
  removeMonitoredWallet,
  recheckMonitoredWallet,
  listAlerts,
} from "../services/monitorService.js";

export const monitorRouter = Router();

const addSchema = z.object({
  address: z.string().min(1),
  network: z.string().min(1),
  label: z.string().optional(),
});

monitorRouter.post("/wallets", async (req, res) => {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  const wallet = await addMonitoredWallet(parsed.data.address, parsed.data.network, parsed.data.label);
  return res.status(201).json(wallet);
});

monitorRouter.get("/wallets", async (_req, res) => {
  return res.json(await listMonitoredWallets());
});

monitorRouter.delete("/wallets/:id", async (req, res) => {
  await removeMonitoredWallet(req.params.id);
  return res.status(204).send();
});

monitorRouter.post("/wallets/:id/recheck", async (req, res) => {
  try {
    const result = await recheckMonitoredWallet(req.params.id);
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: "Recheck failed", message: (err as Error).message });
  }
});

monitorRouter.get("/alerts", async (req, res) => {
  const walletId = typeof req.query.walletId === "string" ? req.query.walletId : undefined;
  return res.json(await listAlerts(walletId));
});

import { Router } from "express";
import { z } from "zod";
import { submitFeedback } from "../services/learningService.js";

export const feedbackRouter = Router();

const feedbackSchema = z.object({
  assessmentId: z.string().min(1),
  verdict: z.enum(["FALSE_POSITIVE", "CONFIRMED_SWEEPER"]),
});

/**
 * The human half of the learning loop. A false-positive report allowlists
 * the addresses that produced the flagged signals in that assessment
 * (source: MANUAL, so it can't be silently overridden by auto-learning
 * later) — future checks stop treating transfers to them as drain
 * evidence. A confirmation reinforces the same addresses as known
 * sweeper destinations with high confidence, ahead of the engine's own
 * auto-learning threshold.
 */
feedbackRouter.post("/feedback", async (req, res) => {
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }
  const { assessmentId, verdict } = parsed.data;

  try {
    const result = await submitFeedback(assessmentId, verdict);
    return res.json(result);
  } catch (err) {
    console.error("[feedback] failed:", err);
    return res.status(404).json({
      error: "Could not process feedback",
      message: (err as Error).message,
    });
  }
});
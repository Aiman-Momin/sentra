import cron from "node-cron";
import { recheckAllMonitoredWallets } from "../services/monitorService.js";

/**
 * Runs every 5 minutes by default. Interval is intentionally coarse:
 * testnets/mainnets don't need sub-minute polling for this use case, and
 * it keeps RPC usage well within free-tier limits.
 */
export function startMonitoringJob(cronExpression = process.env.SENTRA_MONITOR_CRON ?? "*/5 * * * *") {
  console.log(`[monitor] scheduling wallet re-checks: "${cronExpression}"`);
  return cron.schedule(cronExpression, async () => {
    console.log("[monitor] running scheduled re-check of monitored wallets...");
    const results = await recheckAllMonitoredWallets();
    const failed = results.filter((r) => !r.ok);
    console.log(`[monitor] checked ${results.length} wallets, ${failed.length} failed`);
    if (failed.length > 0) console.warn("[monitor] failures:", failed);
  });
}

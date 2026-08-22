import { describe, it, expect } from "vitest";
import { analyzeWallet } from "../src/engine";
import type { NormalizedTransfer, WalletActivity } from "../src/types";

// NOTE: All addresses/tx hashes below are synthetic fixtures for unit
// testing the pure scoring logic ONLY. They are never used anywhere in
// the running application — real activity always comes from the
// blockchain data provider in packages/backend.

function tx(partial: Partial<NormalizedTransfer>): NormalizedTransfer {
  return {
    txHash: "0xtest",
    timestamp: 0,
    blockNumber: 0,
    direction: "IN",
    asset: "USDT",
    amount: "100",
    counterparty: "0xcounterparty",
    isNativeAsset: false,
    ...partial,
  };
}

function activity(transfers: NormalizedTransfer[]): WalletActivity {
  return {
    address: "0xwallet",
    network: "polygon-amoy",
    transfers,
    fetchedAt: 1000,
  };
}

describe("analyzeWallet", () => {
  it("returns insufficientData with no signals for an empty wallet", () => {
    const result = analyzeWallet(activity([]));
    expect(result.insufficientData).toBe(true);
    expect(result.riskScore).toBe(0);
    expect(result.riskLevel).toBe("NORMAL");
  });

  it("does not flag a normal wallet with a single unrelated deposit", () => {
    const result = analyzeWallet(
      activity([tx({ txHash: "0x1", timestamp: 1000, direction: "IN", amount: "50" })])
    );
    expect(result.riskLevel).toBe("NORMAL");
    expect(result.signals.length).toBe(0);
  });

  it("flags a single fast deposit->drain but does not call it ACTIVE_SWEEPER_LIKELY alone", () => {
    const result = analyzeWallet(
      activity([
        tx({ txHash: "0x1", timestamp: 1000, direction: "IN", amount: "500" }),
        tx({ txHash: "0x2", timestamp: 1005, direction: "OUT", amount: "500", counterparty: "0xdest" }),
      ])
    );
    expect(result.signals.some((s) => s.id === "FAST_DRAIN")).toBe(true);
    expect(result.riskLevel).not.toBe("ACTIVE_SWEEPER_LIKELY");
  });

  it("flags ACTIVE_SWEEPER_LIKELY for repeated fast drains to the same destination", () => {
    const result = analyzeWallet(
      activity([
        tx({ txHash: "0x1", timestamp: 1000, direction: "IN", amount: "500" }),
        tx({ txHash: "0x2", timestamp: 1002, direction: "OUT", amount: "500", counterparty: "0xdest" }),
        tx({ txHash: "0x3", timestamp: 2000, direction: "IN", amount: "1000" }),
        tx({ txHash: "0x4", timestamp: 2002, direction: "OUT", amount: "1000", counterparty: "0xdest" }),
        tx({ txHash: "0x5", timestamp: 3000, direction: "IN", amount: "200" }),
        tx({ txHash: "0x6", timestamp: 3002, direction: "OUT", amount: "200", counterparty: "0xdest" }),
      ])
    );
    expect(result.riskLevel).toBe("ACTIVE_SWEEPER_LIKELY");
    expect(result.signals.some((s) => s.id === "REPEATED_FAST_DRAIN")).toBe(true);
    expect(result.signals.some((s) => s.id === "REPEATED_DESTINATION")).toBe(true);
    expect(result.signals.some((s) => s.id === "FULL_BALANCE_DRAIN")).toBe(true);
    expect(result.recommendation).toMatch(/DO NOT SEND/);
  });

  it("detects gas-funding-then-drain pattern", () => {
    const result = analyzeWallet(
      activity([
        tx({ txHash: "0x1", timestamp: 1000, direction: "IN", asset: "MATIC", isNativeAsset: true, amount: "0.5" }),
        tx({ txHash: "0x2", timestamp: 1010, direction: "OUT", asset: "USDC", amount: "300", counterparty: "0xdest" }),
      ])
    );
    expect(result.signals.some((s) => s.id === "GAS_FUNDING_THEN_DRAIN")).toBe(true);
  });

  it("detects multi-asset sweeps across USDT and USDC", () => {
    const result = analyzeWallet(
      activity([
        tx({ txHash: "0x1", timestamp: 1000, direction: "IN", asset: "USDT", amount: "500" }),
        tx({ txHash: "0x2", timestamp: 1003, direction: "OUT", asset: "USDT", amount: "500", counterparty: "0xdest" }),
        tx({ txHash: "0x3", timestamp: 1100, direction: "IN", asset: "USDC", amount: "300" }),
        tx({ txHash: "0x4", timestamp: 1103, direction: "OUT", asset: "USDC", amount: "300", counterparty: "0xdest2" }),
      ])
    );
    expect(result.signals.some((s) => s.id === "MULTI_ASSET_SWEEP")).toBe(true);
  });

  it("does not flag a slow, unrelated withdrawal as a fast drain", () => {
    const result = analyzeWallet(
      activity([
        tx({ txHash: "0x1", timestamp: 1000, direction: "IN", amount: "500" }),
        tx({ txHash: "0x2", timestamp: 1000 + 3600, direction: "OUT", amount: "500", counterparty: "0xdest" }),
      ])
    );
    expect(result.signals.some((s) => s.id === "FAST_DRAIN")).toBe(false);
    expect(result.riskLevel).toBe("NORMAL");
  });

  it("caps risk score at 100", () => {
    const transfers: NormalizedTransfer[] = [];
    for (let i = 0; i < 10; i++) {
      transfers.push(
        tx({ txHash: `0xin${i}`, timestamp: i * 1000, direction: "IN", asset: "USDT", amount: "100" })
      );
      transfers.push(
        tx({
          txHash: `0xout${i}`,
          timestamp: i * 1000 + 1,
          direction: "OUT",
          asset: "USDT",
          amount: "100",
          counterparty: "0xdest",
        })
      );
    }
    const result = analyzeWallet(activity(transfers));
    expect(result.riskScore).toBeLessThanOrEqual(100);
  });

  it("flags a transfer to a previously-confirmed sweeper destination even when it wasn't fast", () => {
    // Slow, single transfer — on its own this wouldn't trigger FAST_DRAIN
    // at all. But the destination is one Sentra already confirmed as a
    // sweeper collection point on some OTHER wallet.
    const result = analyzeWallet(
      activity([
        tx({ txHash: "0x1", timestamp: 1000, direction: "IN", amount: "500" }),
        tx({ txHash: "0x2", timestamp: 1000 + 3600, direction: "OUT", amount: "500", counterparty: "0xknownbad" }),
      ]),
      { knownSweeperDestinations: new Map([["0xknownbad", 0.9]]) }
    );
    const knownSignal = result.signals.find((s) => s.id === "KNOWN_SWEEPER_DESTINATION");
    expect(knownSignal).toBeDefined();
    expect(knownSignal!.weight).toBeGreaterThan(0);
    expect(result.riskLevel).not.toBe("NORMAL");
  });

  it("does not flag transfers to a verified-safe address as a drain", () => {
    // Exact same shape as the "repeated fast drains" ACTIVE_SWEEPER_LIKELY
    // case, except the destination has been manually verified safe (e.g.
    // after a false-positive report) — should read as NORMAL now.
    const result = analyzeWallet(
      activity([
        tx({ txHash: "0x1", timestamp: 1000, direction: "IN", amount: "500" }),
        tx({ txHash: "0x2", timestamp: 1002, direction: "OUT", amount: "500", counterparty: "0xdexrouter" }),
        tx({ txHash: "0x3", timestamp: 2000, direction: "IN", amount: "1000" }),
        tx({ txHash: "0x4", timestamp: 2002, direction: "OUT", amount: "1000", counterparty: "0xdexrouter" }),
      ]),
      { verifiedSafeAddresses: new Set(["0xdexrouter"]) }
    );
    expect(result.signals.length).toBe(0);
    expect(result.riskLevel).toBe("NORMAL");
  });

  it("verified-safe suppression is per-address, not global — other destinations still score normally", () => {
    const result = analyzeWallet(
      activity([
        tx({ txHash: "0x1", timestamp: 1000, direction: "IN", amount: "500" }),
        tx({ txHash: "0x2", timestamp: 1002, direction: "OUT", amount: "500", counterparty: "0xdexrouter" }),
        tx({ txHash: "0x3", timestamp: 2000, direction: "IN", amount: "1000" }),
        tx({ txHash: "0x4", timestamp: 2002, direction: "OUT", amount: "1000", counterparty: "0xdest" }),
      ]),
      { verifiedSafeAddresses: new Set(["0xdexrouter"]) }
    );
    expect(result.signals.some((s) => s.id === "FAST_DRAIN")).toBe(true);
    expect(result.riskLevel).not.toBe("NORMAL");
  });
});
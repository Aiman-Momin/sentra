import { useState } from "react";
import { api, ApiError, type RiskResult } from "../api/client";
import { AddressInput, NetworkSelect, Panel, PrimaryButton } from "../components/Shell";
import { RiskGauge, RiskLevelBadge } from "../components/RiskGauge";
import { Timeline } from "../components/Timeline";

export function WalletCheckPage() {
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("polygon-mainnet");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RiskResult | null>(null);

  async function runCheck() {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await api.checkRecipient(address.trim(), network);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong reaching Sentra's API.");
    } finally {
      setLoading(false);
    }
  }

  const allEvidence = new Set(result?.signals.flatMap((s) => s.evidenceTxHashes) ?? []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Wallet Check</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 13.5, marginTop: 6 }}>
          Is this wallet safe to receive your funds? Sentra reads its real on-chain history and looks for
          sweeper-bot behavior before you send.
        </p>
      </div>

      <Panel>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <AddressInput value={address} onChange={setAddress} placeholder="Recipient wallet address (0x...)" />
          </div>
          <NetworkSelect value={network} onChange={setNetwork} />
          <PrimaryButton onClick={runCheck} disabled={loading || address.trim().length === 0}>
            {loading ? "Scanning…" : "Check Wallet"}
          </PrimaryButton>
        </div>
      </Panel>

      {error && (
        <Panel style={{ borderColor: "var(--red)", background: "var(--red-dim)" }}>
          <div className="mono" style={{ fontSize: 13, color: "var(--red)" }}>
            {error}
          </div>
        </Panel>
      )}

      {result && (
        <>
          <Panel>
            <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
              <RiskGauge score={result.riskScore} level={result.riskLevel} />
              <div style={{ flex: 1 }}>
                <RiskLevelBadge level={result.riskLevel} />
                <div className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 10 }}>
                  {result.address}
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 14, lineHeight: 1.5 }}>
                  {result.recommendation}
                </div>
                {result.insufficientData && (
                  <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 8 }}>
                    Sentra found no on-chain activity for this address in the scanned window — there isn't
                    enough history yet to assess risk. This is not the same as a clean bill of health.
                  </div>
                )}
              </div>
            </div>
          </Panel>

          {result.signals.length > 0 && (
            <Panel>
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 14px", color: "var(--text-secondary)" }}>
                EVIDENCE ({result.signals.length} signal{result.signals.length > 1 ? "s" : ""})
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {result.signals.map((s) => (
                  <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span
                      className="mono"
                      style={{
                        fontSize: 11,
                        color: "var(--red)",
                        border: "1px solid color-mix(in srgb, var(--red) 40%, transparent)",
                        borderRadius: 4,
                        padding: "2px 6px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      +{s.weight}
                    </span>
                    <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>{s.description}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 14px", color: "var(--text-secondary)" }}>
              TRANSACTION TIMELINE
            </h2>
            <Timeline transfers={result.timeline} network={result.network} highlightTxHashes={allEvidence} />
          </Panel>
        </>
      )}
    </div>
  );
}

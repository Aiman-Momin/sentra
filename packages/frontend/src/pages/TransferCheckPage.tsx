import { useState } from "react";
import { api, ApiError, type TransferCheckResult } from "../api/client";
import { AddressInput, NetworkSelect, Panel, PrimaryButton } from "../components/Shell";
import { RiskLevelBadge } from "../components/RiskGauge";
import { Timeline } from "../components/Timeline";

export function TransferCheckPage() {
  const [sender, setSender] = useState("");
  const [recipient, setRecipient] = useState("");
  const [asset, setAsset] = useState("USDT");
  const [amount, setAmount] = useState("");
  const [network, setNetwork] = useState("polygon-mainnet");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransferCheckResult | null>(null);

  const canSubmit = sender.trim() && recipient.trim() && asset.trim() && amount.trim();

  async function runCheck() {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await api.checkTransfer({
        senderWallet: sender.trim(),
        recipientWallet: recipient.trim(),
        network,
        asset: asset.trim(),
        amount: amount.trim(),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong reaching Sentra's API.");
    } finally {
      setLoading(false);
    }
  }

  const blocked = result?.decision === "BLOCK";
  const allEvidence = new Set(result?.risk.signals.flatMap((s) => s.evidenceTxHashes) ?? []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Transfer Check</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 13.5, marginTop: 6 }}>
          Sentra checks the recipient before you send. A blocked recommendation means it should not proceed.
        </p>
      </div>

      <Panel>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Sender wallet">
            <AddressInput value={sender} onChange={setSender} placeholder="0x... (your wallet)" />
          </Field>
          <Field label="Recipient wallet">
            <AddressInput value={recipient} onChange={setRecipient} placeholder="0x... (destination)" />
          </Field>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="Asset">
                <AddressInput value={asset} onChange={setAsset} placeholder="USDT" />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Amount">
                <AddressInput value={amount} onChange={setAmount} placeholder="1000" />
              </Field>
            </div>
            <div>
              <Field label="Network">
                <NetworkSelect value={network} onChange={setNetwork} />
              </Field>
            </div>
          </div>
          <div>
            <PrimaryButton onClick={runCheck} disabled={loading || !canSubmit}>
              {loading ? "Checking recipient…" : "Check Before Sending"}
            </PrimaryButton>
          </div>
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
          <Panel style={blocked ? { borderColor: "var(--red)", background: "var(--red-dim)" } : undefined}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
              <span
                className="mono"
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: blocked ? "var(--red)" : "var(--cyan)",
                  letterSpacing: "0.02em",
                }}
              >
                {blocked ? "DO NOT SEND" : "OK TO SEND"}
              </span>
              <RiskLevelBadge level={result.risk.riskLevel} />
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{result.risk.recommendation}</div>
            <div className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 14 }}>
              {result.amount} {result.asset} → {result.recipientWallet}
            </div>
          </Panel>

          {result.risk.signals.length > 0 && (
            <Panel>
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 14px", color: "var(--text-secondary)" }}>
                EVIDENCE
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {result.risk.signals.map((s) => (
                  <div key={s.id} style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                    • {s.description}
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 14px", color: "var(--text-secondary)" }}>
              RECIPIENT TIMELINE
            </h2>
            <Timeline transfers={result.risk.timeline} network={result.risk.network} highlightTxHashes={allEvidence} />
          </Panel>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", letterSpacing: "0.04em" }}>
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}

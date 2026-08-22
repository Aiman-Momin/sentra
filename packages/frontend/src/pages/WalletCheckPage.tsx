import { useState } from "react";
import { api, ApiError, type RiskResult, type TransferCheckResult } from "../api/client";
import { AddressInput, NetworkSelect, Panel, PrimaryButton } from "../components/Shell";
import { RiskGauge, RiskLevelBadge } from "../components/RiskGauge";
import { Timeline } from "../components/Timeline";

/**
 * One screen for "is this wallet safe" — with an optional section for
 * "I'm about to send funds", which adds an ALLOW/BLOCK decision on top of
 * the same underlying risk check. Both call the same recipient analysis;
 * the transfer fields just add sender/asset/amount context and a policy
 * decision, mirroring what a real wallet/exchange integration would get
 * from POST /api/check-transfer at the moment of sending.
 */
export function WalletCheckPage() {
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("polygon-mainnet");
  const [showTransferDetails, setShowTransferDetails] = useState(false);
  const [sender, setSender] = useState("");
  const [asset, setAsset] = useState("");
  const [amount, setAmount] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RiskResult | null>(null);
  const [transferResult, setTransferResult] = useState<TransferCheckResult | null>(null);

  const transferFieldsFilled = sender.trim() && asset.trim() && amount.trim();
  const isTransferMode = showTransferDetails && Boolean(transferFieldsFilled);

  async function runCheck() {
    setError(null);
    setResult(null);
    setTransferResult(null);
    setLoading(true);
    try {
      if (isTransferMode) {
        const res = await api.checkTransfer({
          senderWallet: sender.trim(),
          recipientWallet: address.trim(),
          network,
          asset: asset.trim(),
          amount: amount.trim(),
        });
        setTransferResult(res);
      } else {
        const res = await api.checkRecipient(address.trim(), network);
        setResult(res);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong reaching Sentra's API.");
    } finally {
      setLoading(false);
    }
  }

  // Normalize to one shape for rendering, whichever mode produced it.
  const risk = transferResult?.risk ?? result;
  const allEvidence = new Set(risk?.signals.flatMap((s) => s.evidenceTxHashes) ?? []);
  const blocked = transferResult?.decision === "BLOCK";

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
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <AddressInput value={address} onChange={setAddress} placeholder="Recipient wallet address (0x...)" />
            </div>
            <NetworkSelect value={network} onChange={setNetwork} />
          </div>

          <button
            onClick={() => setShowTransferDetails((v) => !v)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--cyan)",
              fontSize: 12.5,
              cursor: "pointer",
              padding: 0,
              textAlign: "left",
              width: "fit-content",
            }}
          >
            {showTransferDetails ? "− Hide transfer details" : "+ I'm about to send funds — add transfer details"}
          </button>

          {showTransferDetails && (
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Field label="Sender wallet">
                  <AddressInput value={sender} onChange={setSender} placeholder="0x... (your wallet)" />
                </Field>
              </div>
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
            </div>
          )}

          <div>
            <PrimaryButton onClick={runCheck} disabled={loading || address.trim().length === 0}>
              {loading ? "Scanning…" : isTransferMode ? "Check Before Sending" : "Check Wallet"}
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

      {risk && (
        <>
          <Panel style={blocked ? { borderColor: "var(--red)", background: "var(--red-dim)" } : undefined}>
            {transferResult ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
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
                  <RiskLevelBadge level={risk.riskLevel} />
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>{risk.recommendation}</div>
                <div className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  {transferResult.amount} {transferResult.asset} → {transferResult.recipientWallet}
                </div>
              </>
            ) : (
              <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
                <RiskGauge score={risk.riskScore} level={risk.riskLevel} />
                <div style={{ flex: 1 }}>
                  <RiskLevelBadge level={risk.riskLevel} />
                  <div className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 10 }}>
                    {risk.address}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginTop: 14, lineHeight: 1.5 }}>
                    {risk.recommendation}
                  </div>
                  {risk.insufficientData && (
                    <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 8 }}>
                      Sentra found no on-chain activity for this address in the scanned window — there isn't
                      enough history yet to assess risk. This is not the same as a clean bill of health.
                    </div>
                  )}
                </div>
              </div>
            )}
          </Panel>

          {risk.signals.length > 0 && (
            <Panel>
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 14px", color: "var(--text-secondary)" }}>
                EVIDENCE ({risk.signals.length} signal{risk.signals.length > 1 ? "s" : ""})
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {risk.signals.map((s) => (
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
            <Timeline transfers={risk.timeline} network={risk.network} highlightTxHashes={allEvidence} />
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
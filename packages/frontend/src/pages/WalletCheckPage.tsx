import { useState } from "react";
import { api, ApiError, type RiskResult, type TransferCheckResult } from "../api/client";
import { AddressInput, NetworkSelect, Panel, PrimaryButton } from "../components/Shell";
import { RiskGauge, RiskLevelBadge } from "../components/RiskGauge";
import { Timeline } from "../components/Timeline";
import { EmptyState } from "../components/EmptyState";

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
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "submitting" | "submitted">("idle");
  const [feedbackVerdict, setFeedbackVerdict] = useState<"FALSE_POSITIVE" | "CONFIRMED_SWEEPER" | null>(null);

  const transferFieldsFilled = sender.trim() && asset.trim() && amount.trim();
  const isTransferMode = showTransferDetails && Boolean(transferFieldsFilled);

  async function runCheck() {
    setError(null);
    setResult(null);
    setTransferResult(null);
    setFeedbackStatus("idle");
    setFeedbackVerdict(null);
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

  async function submitFeedback(verdict: "FALSE_POSITIVE" | "CONFIRMED_SWEEPER") {
    if (!risk?.assessmentId) return;
    setFeedbackStatus("submitting");
    try {
      await api.submitFeedback(risk.assessmentId, verdict);
      setFeedbackVerdict(verdict);
      setFeedbackStatus("submitted");
    } catch {
      setFeedbackStatus("idle");
    }
  }

  // Normalize to one shape for rendering, whichever mode produced it.
  const risk = transferResult?.risk ?? result;
  const allEvidence = new Set(risk?.signals.flatMap((s) => s.evidenceTxHashes) ?? []);
  const blocked = transferResult?.decision === "BLOCK";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="page-heading">
        <div className="page-heading-ref">DOCKET — WALLET INTAKE</div>
        <h1 style={{ fontSize: 23, fontWeight: 700, margin: 0 }}>Wallet Check</h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 13.5, marginTop: 8, maxWidth: 520, lineHeight: 1.6 }}>
          Is this wallet safe to receive your funds? Sentra reads its real on-chain history and looks for
          sweeper-bot behavior before you send.
        </p>
      </div>

      <Panel>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="Recipient wallet">
                <AddressInput value={address} onChange={setAddress} placeholder="0x... wallet to check" />
              </Field>
            </div>
            <Field label="Network">
              <NetworkSelect value={network} onChange={setNetwork} />
            </Field>
          </div>

          <button
            onClick={() => setShowTransferDetails((v) => !v)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--ink)",
              fontFamily: "var(--font-mono)",
              fontSize: 11.5,
              textDecoration: "underline",
              textUnderlineOffset: 3,
              cursor: "pointer",
              padding: 0,
              textAlign: "left",
              width: "fit-content",
            }}
          >
            {showTransferDetails ? "− HIDE TRANSFER DETAILS" : "+ I'M ABOUT TO SEND FUNDS — ADD TRANSFER DETAILS"}
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
              {loading ? "SCANNING…" : isTransferMode ? "CHECK BEFORE SENDING" : "CHECK WALLET"}
            </PrimaryButton>
          </div>
        </div>
      </Panel>

      {error && (
        <Panel style={{ borderColor: "var(--stamp-red)", background: "var(--stamp-red-wash)", boxShadow: "3px 3px 0 var(--stamp-red)" }}>
          <div className="mono" style={{ fontSize: 13, color: "var(--stamp-red)" }}>
            {error}
          </div>
        </Panel>
      )}

      {!error && !risk && !loading && (
        <EmptyState
          icon={<span style={{ fontSize: 26, fontFamily: "var(--font-display)" }}>◎</span>}
          title="No wallet checked yet"
          description="Enter a Polygon address above to see its real on-chain risk score, evidence, and transaction timeline."
        />
      )}

      {risk && (
        <>
          <Panel style={blocked ? { borderColor: "var(--stamp-red)", boxShadow: "3px 3px 0 var(--stamp-red)" } : undefined}>
            {transferResult ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
                  <span className={`stamp ${blocked ? "stamp-danger" : "stamp-safe"}`} style={{ fontSize: 15 }}>
                    {blocked ? "Do not send" : "OK to send"}
                  </span>
                  <RiskLevelBadge level={risk.riskLevel} score={risk.riskScore} />
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 12 }}>{risk.recommendation}</div>
                <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
                  {transferResult.amount} {transferResult.asset} → {transferResult.recipientWallet}
                </div>
              </>
            ) : (
              <div style={{ display: "flex", gap: 30, alignItems: "center", flexWrap: "wrap" }}>
                <RiskGauge score={risk.riskScore} level={risk.riskLevel} />
                <div style={{ flex: 1, minWidth: 220 }}>
                  <RiskLevelBadge level={risk.riskLevel} score={risk.riskScore} />
                  <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 10 }}>
                    {risk.address}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginTop: 14, lineHeight: 1.5, fontFamily: "var(--font-display)" }}>
                    {risk.recommendation}
                  </div>
                  {risk.insufficientData && (
                    <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 8, lineHeight: 1.5 }}>
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
              <SectionHeading>
                EVIDENCE — {risk.signals.length} signal{risk.signals.length > 1 ? "s" : ""}
              </SectionHeading>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {risk.signals.map((s) => (
                  <div key={s.id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span
                      className="mono"
                      style={{
                        fontSize: 10.5,
                        color: "var(--stamp-red)",
                        border: "1px solid var(--stamp-red)",
                        borderRadius: 3,
                        padding: "2px 6px",
                        whiteSpace: "nowrap",
                        marginTop: 1,
                      }}
                    >
                      +{s.weight}
                    </span>
                    <span style={{ fontSize: 13.5, lineHeight: 1.55 }}>{s.description}</span>
                  </div>
                ))}
              </div>

              {risk.assessmentId && (
                <div
                  style={{
                    marginTop: 18,
                    paddingTop: 16,
                    borderTop: "1px solid var(--rule)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  {feedbackStatus === "submitted" ? (
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                      {feedbackVerdict === "FALSE_POSITIVE"
                        ? "Thanks — this address won't be flagged like this again."
                        : "Thanks — this destination is now remembered as a known sweeper address."}
                    </span>
                  ) : (
                    <>
                      <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-faint)", letterSpacing: "0.04em" }}>
                        DOES THIS LOOK RIGHT?
                      </span>
                      <button
                        onClick={() => submitFeedback("CONFIRMED_SWEEPER")}
                        disabled={feedbackStatus === "submitting"}
                        className="mono"
                        style={ghostBtn}
                      >
                        Confirm — this is a sweeper
                      </button>
                      <button
                        onClick={() => submitFeedback("FALSE_POSITIVE")}
                        disabled={feedbackStatus === "submitting"}
                        className="mono"
                        style={{ ...ghostBtn, color: "var(--ink-faint)" }}
                      >
                        This looks wrong — false positive
                      </button>
                    </>
                  )}
                </div>
              )}
            </Panel>
          )}

          <Panel>
            <SectionHeading>Transaction Timeline</SectionHeading>
            <Timeline transfers={risk.timeline} network={risk.network} highlightTxHashes={allEvidence} />
          </Panel>
        </>
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 12,
        fontWeight: 600,
        margin: "0 0 16px",
        color: "var(--ink-soft)",
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        paddingBottom: 10,
        borderBottom: "1px solid var(--rule)",
      }}
    >
      {children}
    </h2>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        className="mono"
        style={{ fontSize: 10.5, color: "var(--ink-faint)", letterSpacing: "0.06em" }}
      >
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "1.5px solid var(--ink)",
  color: "var(--ink)",
  borderRadius: 2,
  padding: "6px 10px",
  fontSize: 10.5,
  letterSpacing: "0.04em",
  cursor: "pointer",
};
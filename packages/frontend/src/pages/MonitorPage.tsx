import { useEffect, useState } from "react";
import { api, ApiError, type Alert, type MonitoredWallet } from "../api/client";
import { AddressInput, NetworkSelect, Panel, PrimaryButton } from "../components/Shell";
import { RiskLevelBadge } from "../components/RiskGauge";

export function MonitorPage() {
  const [wallets, setWallets] = useState<MonitoredWallet[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [network, setNetwork] = useState("polygon-mainnet");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [w, a] = await Promise.all([api.listMonitoredWallets(), api.listAlerts()]);
      setWallets(w);
      setAlerts(a);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach Sentra's API.");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addWallet() {
    if (!address.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.addMonitoredWallet(address.trim(), network, label.trim() || undefined);
      setAddress("");
      setLabel("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add wallet.");
    } finally {
      setBusy(false);
    }
  }

  async function recheck(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.recheckMonitoredWallet(id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Recheck failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api.removeMonitoredWallet(id);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="page-heading">
        <div className="page-heading-ref">DOCKET — STANDING WATCH</div>
        <h1 style={{ fontSize: 23, fontWeight: 700, margin: 0 }}>Monitoring</h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 13.5, marginTop: 8, maxWidth: 520, lineHeight: 1.6 }}>
          Sentra re-checks monitored wallets on a schedule and raises an alert the moment new sweeper
          behavior appears.
        </p>
      </div>

      <Panel>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <Field label="Wallet address">
              <AddressInput value={address} onChange={setAddress} placeholder="0x... wallet to monitor" />
            </Field>
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <Field label="Label (optional)">
              <AddressInput value={label} onChange={setLabel} placeholder="e.g. Exchange hot wallet" />
            </Field>
          </div>
          <Field label="Network">
            <NetworkSelect value={network} onChange={setNetwork} />
          </Field>
          <PrimaryButton onClick={addWallet} disabled={busy || !address.trim()}>
            ADD TO WATCH
          </PrimaryButton>
        </div>
      </Panel>

      {error && (
        <Panel style={{ borderColor: "var(--stamp-red)", background: "var(--stamp-red-wash)", boxShadow: "3px 3px 0 var(--stamp-red)" }}>
          <div className="mono" style={{ fontSize: 13, color: "var(--stamp-red)" }}>
            {error}
          </div>
        </Panel>
      )}

      <Panel>
        <SectionHeading>Monitored Wallets</SectionHeading>
        {wallets.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--ink-faint)" }}>Not watching any wallets yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {wallets.map((w, i) => (
              <div
                key={w.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 4px",
                  borderTop: i === 0 ? "none" : "1px solid var(--rule)",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, fontFamily: "var(--font-display)" }}>
                    {w.label || "Unlabeled wallet"}
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 2 }}>
                    {w.address} · {w.network}
                  </div>
                </div>
                {w.lastRiskLevel && <RiskLevelBadge level={w.lastRiskLevel} />}
                <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-faint)" }}>
                  {w.lastCheckedAt ? `checked ${new Date(w.lastCheckedAt).toLocaleTimeString()}` : "never checked"}
                </span>
                <button onClick={() => recheck(w.id)} disabled={busy} className="mono" style={ghostBtn}>
                  RECHECK
                </button>
                <button onClick={() => remove(w.id)} disabled={busy} className="mono" style={{ ...ghostBtn, color: "var(--ink-faint)" }}>
                  REMOVE
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <SectionHeading>Alerts</SectionHeading>
        {alerts.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--ink-faint)" }}>No alerts yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {alerts.map((a, i) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "baseline",
                  padding: "10px 4px",
                  borderTop: i === 0 ? "none" : "1px solid var(--rule)",
                }}
              >
                <span className="mono" style={{ fontSize: 10.5, color: "var(--stamp-red)", whiteSpace: "nowrap" }}>
                  {new Date(a.createdAt).toLocaleString()}
                </span>
                <span style={{ fontSize: 13 }}>{a.message}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 12,
        fontWeight: 600,
        margin: "0 0 14px",
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
      <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-faint)", letterSpacing: "0.06em" }}>
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}
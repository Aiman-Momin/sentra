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
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Monitoring</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 13.5, marginTop: 6 }}>
          Sentra re-checks monitored wallets on a schedule and raises an alert the moment new sweeper
          behavior appears.
        </p>
      </div>

      <Panel>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 2 }}>
            <AddressInput value={address} onChange={setAddress} placeholder="Wallet address to monitor" />
          </div>
          <div style={{ flex: 1 }}>
            <AddressInput value={label} onChange={setLabel} placeholder="Label (optional)" />
          </div>
          <NetworkSelect value={network} onChange={setNetwork} />
          <PrimaryButton onClick={addWallet} disabled={busy || !address.trim()}>
            Add
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

      <Panel>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 14px", color: "var(--text-secondary)" }}>
          MONITORED WALLETS
        </h2>
        {wallets.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Not watching any wallets yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {wallets.map((w) => (
              <div
                key={w.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{w.label || "Unlabeled wallet"}</div>
                  <div className="mono" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    {w.address} · {w.network}
                  </div>
                </div>
                {w.lastRiskLevel && <RiskLevelBadge level={w.lastRiskLevel} />}
                <span className="mono" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                  {w.lastCheckedAt ? `checked ${new Date(w.lastCheckedAt).toLocaleTimeString()}` : "never checked"}
                </span>
                <button
                  onClick={() => recheck(w.id)}
                  disabled={busy}
                  style={{
                    background: "var(--bg-2)",
                    border: "1px solid var(--line)",
                    color: "var(--text-primary)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Recheck
                </button>
                <button
                  onClick={() => remove(w.id)}
                  disabled={busy}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--line)",
                    color: "var(--text-tertiary)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 14px", color: "var(--text-secondary)" }}>
          ALERTS
        </h2>
        {alerts.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No alerts yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {alerts.map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--red)", whiteSpace: "nowrap" }}>
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

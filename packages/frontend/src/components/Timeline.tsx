import type { NormalizedTransfer } from "../api/client";

function formatTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function truncate(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function explorerBaseUrl(network: string): string {
  if (network === "polygon-mainnet") return "https://polygonscan.com";
  if (network === "polygon-amoy") return "https://amoy.polygonscan.com";
  return "https://polygonscan.com";
}

export function Timeline({
  transfers,
  network,
  highlightTxHashes,
}: {
  transfers: NormalizedTransfer[];
  network: string;
  highlightTxHashes?: Set<string>;
}) {
  if (transfers.length === 0) {
    return <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>No transactions found for this wallet in the scanned window.</div>;
  }
  const explorerBase = explorerBaseUrl(network);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {transfers.map((t, i) => {
        const isHighlighted = highlightTxHashes?.has(t.txHash);
        const isOut = t.direction === "OUT";
        return (
          <div
            key={`${t.txHash}-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "160px 90px 1fr 1fr",
              gap: 12,
              alignItems: "center",
              padding: "10px 12px",
              borderBottom: i < transfers.length - 1 ? "1px solid var(--line)" : "none",
              background: isHighlighted ? "color-mix(in srgb, var(--red) 8%, transparent)" : "transparent",
              borderRadius: 4,
            }}
          >
            <span className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              {formatTime(t.timestamp)}
            </span>
            <span
              className="mono"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: isOut ? "var(--red)" : "var(--cyan)",
              }}
            >
              {isOut ? "−" : "+"}
              {t.amount} {t.asset}
            </span>
            <span className="mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {isOut ? "to" : "from"} {truncate(t.counterparty)}
            </span>
            <a
              className="mono"
              href={`${explorerBase}/tx/${t.txHash}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 11, color: "var(--text-tertiary)", textDecoration: "none" }}
            >
              {truncate(t.txHash)} ↗
            </a>
          </div>
        );
      })}
    </div>
  );
}

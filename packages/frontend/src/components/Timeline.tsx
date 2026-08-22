/**
 * NOTE: your api/client.ts wasn't in what I received, so this reads
 * transfer fields defensively (checking a few likely field names) instead
 * of importing your real `Transfer` type. Once you drop this in, swap the
 * `TimelineTransfer` shape below for your actual type and remove the
 * fallback chains in `field()` — they're only here so this compiles and
 * renders sensibly against several plausible shapes.
 */
type TimelineTransfer = Record<string, unknown>;

function field(t: TimelineTransfer, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = t[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return undefined;
}

function truncateHash(h?: string) {
  if (!h) return "—";
  return h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h;
}

function DrainPulse({ alert }: { alert: boolean }) {
  const stroke = alert ? "var(--stamp-red)" : "var(--ink-faint)";
  const d = alert
    ? "M0 10 L10 10 L14 2 L18 18 L22 10 L34 10"
    : "M0 10 L34 10";
  return (
    <svg className="pulse-line" viewBox="0 0 34 20" width="34" height="20">
      <path d={d} stroke={stroke} />
    </svg>
  );
}

export function Timeline({
  transfers,
  network,
  highlightTxHashes,
}: {
  transfers: TimelineTransfer[];
  network?: string;
  highlightTxHashes?: Set<string>;
}) {
  if (!transfers || transfers.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--ink-faint)" }}>
        No transfer history found{network ? ` on ${network}` : ""}.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {transfers.map((t, i) => {
        const hash = field(t, ["hash", "txHash", "transactionHash"]);
        const from = field(t, ["from", "fromAddress", "sender"]);
        const to = field(t, ["to", "toAddress", "recipient"]);
        const amount = field(t, ["amount", "value", "formattedValue"]);
        const asset = field(t, ["asset", "token", "symbol", "tokenSymbol"]);
        const timestamp = field(t, ["timestamp", "blockTimestamp", "time", "date"]);
        const isEvidence = Boolean(hash && highlightTxHashes?.has(hash));

        return (
          <div
            key={hash ?? i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "12px 4px",
              borderTop: i === 0 ? "none" : "1px solid var(--rule)",
              background: isEvidence ? "var(--stamp-red-wash)" : "transparent",
              borderLeft: isEvidence ? "3px solid var(--stamp-red)" : "3px solid transparent",
              paddingLeft: isEvidence ? 9 : 12,
            }}
          >
            <DrainPulse alert={isEvidence} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink)" }}>
                {truncateHash(from)} → {truncateHash(to)}
              </div>
              <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-faint)", marginTop: 3 }}>
                {timestamp ?? "unknown time"} {hash ? `· ${truncateHash(hash)}` : ""}
              </div>
            </div>
            {(amount || asset) && (
              <div className="mono" style={{ fontSize: 12.5, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>
                {amount} {asset}
              </div>
            )}
            {isEvidence && <span className="stamp stamp-danger" style={{ fontSize: 9.5, padding: "3px 8px" }}>EVIDENCE</span>}
          </div>
        );
      })}
    </div>
  );
}
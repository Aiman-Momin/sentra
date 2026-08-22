/**
 * Tone mapping is done defensively off the level string (case-insensitive
 * substring match) so this works whichever exact casing/labels your
 * RiskLevel union in api/client.ts uses (e.g. "LOW" | "MEDIUM" | "HIGH" |
 * "CRITICAL", or "low" | "medium" | "high"). Adjust the buckets below if
 * your real union has different tiers.
 */
function toneFor(level: string): "safe" | "caution" | "danger" {
  const l = level.toLowerCase();
  if (l.includes("crit") || l.includes("high")) return "danger";
  if (l.includes("med") || l.includes("caution") || l.includes("moderate")) return "caution";
  return "safe";
}

const TONE_COLOR: Record<string, string> = {
  danger: "var(--stamp-red)",
  caution: "var(--stamp-amber)",
  safe: "var(--stamp-green)",
};

export function RiskGauge({ score, level }: { score: number; level: string }) {
  const tone = toneFor(level);
  const color = TONE_COLOR[tone];
  const clamped = Math.max(0, Math.min(100, score));

  const r = 46;
  const c = 2 * Math.PI * r;
  const filled = (clamped / 100) * c;

  const ticks = Array.from({ length: 20 });

  return (
    <div style={{ position: "relative", width: 128, height: 128, flex: "none" }}>
      <svg viewBox="0 0 128 128" width={128} height={128}>
        {/* instrument tick ring */}
        {ticks.map((_, i) => {
          const angle = (i / ticks.length) * 2 * Math.PI - Math.PI / 2;
          const x1 = 64 + Math.cos(angle) * 58;
          const y1 = 64 + Math.sin(angle) * 58;
          const x2 = 64 + Math.cos(angle) * 62;
          const y2 = 64 + Math.sin(angle) * 62;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--rule-strong)"
              strokeWidth={1}
            />
          );
        })}
        <circle cx={64} cy={64} r={r} fill="none" stroke="var(--rule)" strokeWidth={7} />
        <circle
          cx={64}
          cy={64}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          transform="rotate(-90 64 64)"
          style={{ transition: "stroke-dasharray 500ms ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="mono" style={{ fontSize: 26, fontWeight: 600, color: "var(--ink)", lineHeight: 1 }}>
          {clamped}
        </div>
        <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-faint)", marginTop: 3, letterSpacing: "0.06em" }}>
          / 100
        </div>
      </div>
    </div>
  );
}

export function RiskLevelBadge({ level }: { level: string }) {
  const tone = toneFor(level);
  const stampClass = tone === "danger" ? "stamp-danger" : tone === "caution" ? "stamp-caution" : "stamp-safe";
  return <span className={`stamp ${stampClass}`}>{level}</span>;
}
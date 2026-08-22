import type { RiskLevel } from "../api/client";

const LEVEL_COLOR: Record<RiskLevel, string> = {
  NORMAL: "var(--cyan)",
  SUSPICIOUS: "var(--amber)",
  HIGH_RISK: "var(--red)",
  ACTIVE_SWEEPER_LIKELY: "var(--red)",
};

export function RiskGauge({ score, level }: { score: number; level: RiskLevel }) {
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const dashOffset = circumference * (1 - pct);
  const color = LEVEL_COLOR[level];

  return (
    <div style={{ position: "relative", width: 220, height: 220 }}>
      <svg width={220} height={220} viewBox="0 0 220 220">
        <circle cx="110" cy="110" r={radius} fill="none" stroke="var(--line)" strokeWidth="10" />
        <circle
          cx="110"
          cy="110"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 110 110)"
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.3s ease" }}
        />
        {/* scan-line sweep, only meaningful while actively risky-looking */}
        {(level === "HIGH_RISK" || level === "ACTIVE_SWEEPER_LIKELY") && (
          <circle
            cx="110"
            cy="110"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeDasharray="2 18"
            opacity="0.5"
            transform="rotate(-90 110 110)"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="-90 110 110"
              to="270 110 110"
              dur="3s"
              repeatCount="indefinite"
            />
          </circle>
        )}
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
        <div className="mono" style={{ fontSize: 44, fontWeight: 600, color, lineHeight: 1 }}>
          {Math.round(score)}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4, letterSpacing: "0.05em" }}>
          / 100
        </div>
      </div>
    </div>
  );
}

export function RiskLevelBadge({ level }: { level: RiskLevel }) {
  const color = LEVEL_COLOR[level];
  const label = level.replace(/_/g, " ");
  return (
    <span
      className="mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.04em",
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

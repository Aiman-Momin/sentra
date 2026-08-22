export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div
      className="ui-panel"
      style={{
        padding: "40px 32px",
        textAlign: "center",
        borderStyle: "dashed",
        boxShadow: "none",
        background: "transparent",
      }}
    >
      <div style={{ color: "var(--ink-faint)", marginBottom: 14 }}>{icon}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: "var(--ink-soft)", maxWidth: 380, margin: "0 auto", lineHeight: 1.6 }}>
        {description}
      </div>
    </div>
  );
}
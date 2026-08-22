export function Footer() {
  return (
    <footer
      style={{
        borderTop: "1.5px solid var(--ink)",
        marginTop: 40,
      }}
    >
      <div
        style={{
          width: "min(100%, 900px)",
          margin: "0 auto",
          padding: "16px 32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-faint)", letterSpacing: "0.04em" }}>
          SENTRA — WALLET RISK INTAKE · NON-CUSTODIAL
        </span>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-faint)" }}>
          NO SIGNATURES REQUESTED · READ-ONLY ANALYSIS
        </span>
      </div>
    </footer>
  );
}
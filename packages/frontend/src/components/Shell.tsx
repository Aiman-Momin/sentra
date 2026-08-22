import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Wallet Check" },
  { to: "/transfer", label: "Transfer Check" },
  { to: "/monitor", label: "Monitoring" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100%", display: "flex" }}>
      <aside
        style={{
          width: 220,
          borderRight: "1px solid var(--line)",
          padding: "28px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 32,
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.01em" }}>
            SENTRA
          </div>
          <div className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
            detect the drain
            <br />
            before the deposit
          </div>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              style={({ isActive }) => ({
                padding: "9px 10px",
                borderRadius: 6,
                fontSize: 13.5,
                textDecoration: "none",
                color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                background: isActive ? "var(--bg-2)" : "transparent",
                borderLeft: isActive ? "2px solid var(--cyan)" : "2px solid transparent",
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ marginTop: "auto", fontSize: 11, color: "var(--text-tertiary)" }}>
          Non-custodial. Never asks for seed phrases or private keys.
        </div>
      </aside>
      <main style={{ flex: 1, padding: "32px 40px", maxWidth: 920 }}>{children}</main>
    </div>
  );
}

export function NetworkSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mono"
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--line)",
        color: "var(--text-primary)",
        borderRadius: 6,
        padding: "10px 12px",
        fontSize: 13,
      }}
    >
      <option value="polygon-mainnet">Polygon Mainnet</option>
      <option value="polygon-amoy">Polygon Amoy (testnet)</option>
    </select>
  );
}

export function AddressInput({
  value,
  onChange,
  placeholder = "0x...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mono"
      spellCheck={false}
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--line)",
        color: "var(--text-primary)",
        borderRadius: 6,
        padding: "10px 12px",
        fontSize: 13,
        width: "100%",
      }}
    />
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "var(--bg-2)" : "var(--cyan)",
        color: disabled ? "var(--text-tertiary)" : "#0a1216",
        border: "none",
        borderRadius: 6,
        padding: "11px 20px",
        fontSize: 13.5,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        letterSpacing: "0.01em",
      }}
    >
      {children}
    </button>
  );
}

export function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        padding: 24,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

import { NavLink, Link } from "react-router-dom";
import { Footer } from "./Footer";

const navItems = [
  { to: "/app", label: "WALLET CHECK" },
  { to: "/app/monitor", label: "MONITORING" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <div className="cf-topbar">
        <div style={{ width: "100%" }}>
          <div className="cf-brand-row">
            <Link to="/" className="app-brand">
              <div className="app-brand-mark">S</div>
              <div>
                <div className="app-brand-name">SENTRA</div>
                <div className="app-brand-sub">WALLET RISK INTAKE</div>
              </div>
            </Link>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-faint)", textAlign: "right" }}>
              NON-CUSTODIAL
              <br />
              never asks for seed phrases or keys
            </div>
          </div>
          <nav className="cf-tabs">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/app"}
                className={({ isActive }) => `cf-tab${isActive ? " cf-tab-active" : ""}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
      <main className="app-main">
        <div className="app-content">{children}</div>
        <Footer />
      </main>
    </div>
  );
}

export function NetworkSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mono ui-control"
      style={{
        background: "var(--paper-raised)",
        border: "1.5px solid var(--ink)",
        color: "var(--ink)",
        borderRadius: 2,
        padding: "10px 12px",
        fontSize: 12.5,
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
      className="mono ui-control"
      spellCheck={false}
      style={{
        background: "var(--paper-raised)",
        border: "1.5px solid var(--ink)",
        color: "var(--ink)",
        borderRadius: 2,
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
      className="ui-primary-button"
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "var(--paper-shade)" : "var(--accent)",
        color: disabled ? "var(--ink-faint)" : "var(--ink)",
        border: "1.5px solid var(--accent)",
        borderRadius: 2,
        padding: "10.5px 20px",
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "var(--font-display)",
        letterSpacing: "0.02em",
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : undefined,
      }}
    >
      {children}
    </button>
  );
}

export function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="ui-panel"
      style={{
        padding: 24,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
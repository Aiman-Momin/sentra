import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Footer } from "../components/Footer";

const CONTENT_WIDTH = 1080;

/* ---------------------------------------------------------------------- */
/* Small inline icons — check + paperclip only, used sparingly.           */
/* ---------------------------------------------------------------------- */

function IconCheck({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

function IconClip() {
  return (
    <svg width="22" height="34" viewBox="0 0 22 34" fill="none" stroke="var(--ink-faint)" strokeWidth="2">
      <path d="M6 9v16a5 5 0 0 0 10 0V7a3.2 3.2 0 0 0-6.4 0v15a1.4 1.4 0 0 0 2.8 0V10" />
    </svg>
  );
}

/* ---------------------------------------------------------------------- */
/* Detection signals — rendered as an inspection checklist, not icon cards */
/* ---------------------------------------------------------------------- */

const SIGNALS = [
  "Fast drain — funds leave within seconds of arriving",
  "Repeated fast drain across multiple deposits",
  "Multi-asset sweep — several tokens drained together",
  "Repeated destination address",
  "Gas-funding then drain",
  "Consistent deposit-to-drain timing",
  "Full-balance drain",
];

/* ---------------------------------------------------------------------- */
/* Process — a genuine four-step sequence, so numbering earns its place   */
/* ---------------------------------------------------------------------- */

const STEPS = [
  {
    n: "01",
    title: "Enter a wallet address",
    body: "Paste any Polygon address before you send it funds — no connection, no signature, nothing custodial required.",
  },
  {
    n: "02",
    title: "Sentra reads real on-chain history",
    body: "The backend pulls that wallet's actual transfer history from the blockchain — native and token transfers, internal transactions included.",
  },
  {
    n: "03",
    title: "The detection engine analyzes it",
    body: "An independent risk engine checks the activity against multiple sweeper-bot signals — no single transaction is enough on its own.",
  },
  {
    n: "04",
    title: "You get a score and the evidence",
    body: "A 0–100 risk score, a plain-language recommendation, and the exact transactions that justify it — never a black box.",
  },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mono section-label">{children}</div>;
}

/* ---------------------------------------------------------------------- */
/* The intake report — the signature element. Types an address, checks    */
/* off signals one by one, then a stamp thuds down with the verdict.      */
/* ---------------------------------------------------------------------- */

type Scenario = {
  fileNo: string;
  address: string;
  checks: string[];
  verdict: {
    label: string;
    score: number;
    tone: "danger" | "safe";
    evidence: string[];
    recommendation: string;
  };
};

const SCENARIOS: Scenario[] = [
  {
    fileNo: "SNT-0417",
    address: "0x9f2A4b1eDCa8763F0091b6C8e2fa41CdA07",
    checks: ["Reading on-chain history", "Checking 7 detection signals", "Fast drain detected — 4s after deposit"],
    verdict: {
      label: "DRAIN RISK",
      score: 92,
      tone: "danger",
      evidence: ["Repeated deposit → drain pattern", "Funds leave within seconds", "Multiple assets swept"],
      recommendation: "Do not send funds.",
    },
  },
  {
    fileNo: "SNT-0418",
    address: "0x3b8Ee0d2F6a9C15b8027dE44a19077Aa",
    checks: ["Reading on-chain history", "Checking 7 detection signals", "No sweep pattern found"],
    verdict: {
      label: "CLEARED",
      score: 6,
      tone: "safe",
      evidence: ["No fast-drain pattern", "No repeated destination", "Normal, consistent activity"],
      recommendation: "No sweeper-bot signals detected.",
    },
  },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);
  return reduced;
}

function IntakeReport() {
  const reducedMotion = useReducedMotion();
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [typedChars, setTypedChars] = useState(0);
  const [visibleChecks, setVisibleChecks] = useState(0);
  const [showStamp, setShowStamp] = useState(false);
  const timers = useRef<number[]>([]);

  const scenario = SCENARIOS[scenarioIndex];

  useEffect(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];

    if (reducedMotion) {
      setTypedChars(scenario.address.length);
      setVisibleChecks(scenario.checks.length);
      setShowStamp(true);
      return;
    }

    setTypedChars(0);
    setVisibleChecks(0);
    setShowStamp(false);

    const addr = scenario.address;
    for (let i = 1; i <= addr.length; i++) {
      timers.current.push(window.setTimeout(() => setTypedChars(i), 350 + i * 24));
    }
    const typingDone = 350 + addr.length * 24;

    scenario.checks.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setVisibleChecks(i + 1), typingDone + 450 + i * 600));
    });
    const checksDone = typingDone + 450 + scenario.checks.length * 600;

    timers.current.push(window.setTimeout(() => setShowStamp(true), checksDone + 250));
    timers.current.push(
      window.setTimeout(() => {
        setScenarioIndex((prev) => (prev + 1) % SCENARIOS.length);
      }, checksDone + 4400)
    );

    return () => timers.current.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioIndex, reducedMotion]);

  const tone = scenario.verdict.tone;

  return (
    <div className="report-sheet">
      <IconClip />
      <div className="report-head">
        <div>
          <div className="mono report-eyebrow">CASE FILE NO. {scenario.fileNo}</div>
          <div className="report-title">Wallet Risk Intake</div>
        </div>
        <div className="mono report-network">POLYGON</div>
      </div>

      <div className="report-field">
        <span className="mono report-field-label">SUBJECT ADDRESS</span>
        <span className="mono report-field-value">
          {scenario.address.slice(0, typedChars)}
          <span className={`report-cursor ${typedChars >= scenario.address.length ? "report-cursor-blink" : ""}`} />
        </span>
      </div>

      <div className="report-checks">
        {scenario.checks.slice(0, visibleChecks).map((line, i) => {
          const isLast = i === scenario.checks.length - 1;
          const done = i < visibleChecks - 1 || showStamp;
          return (
            <div className="report-check-row" key={line}>
              <span className={`cf-check ${isLast && done ? `cf-check-${tone}` : ""}`}>
                {done && <IconCheck />}
              </span>
              <span className="mono report-check-label">{line}</span>
            </div>
          );
        })}
      </div>

      <div className={`report-verdict ${showStamp ? "report-verdict-in" : ""}`}>
        <div className="report-verdict-top">
          <span className={`stamp stamp-${tone === "danger" ? "danger" : "safe"} report-stamp`}>
            {scenario.verdict.label}
          </span>
          <div className={`mono report-score report-score-${tone}`}>
            {scenario.verdict.score}
            <span className="report-score-max">/100</span>
          </div>
        </div>
        <div className="report-evidence">
          {scenario.verdict.evidence.map((e) => (
            <div className="report-evidence-row mono" key={e}>
              · {e}
            </div>
          ))}
        </div>
        <div className="report-recommendation">{scenario.verdict.recommendation}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Page                                                                    */
/* ---------------------------------------------------------------------- */

export function LandingPage() {
  return (
    <div className="landing-root">
      <style>{`
        .landing-root {
          --content-width: ${CONTENT_WIDTH}px;
          min-height: 100%;
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .landing-inner {
          max-width: var(--content-width);
          margin: 0 auto;
          width: 100%;
          padding-left: 36px;
          padding-right: 36px;
          box-sizing: border-box;
        }

        .landing-header {
          border-bottom: 2px solid var(--ink);
          position: sticky;
          top: 0;
          background: var(--paper);
          z-index: 20;
        }
        .landing-header-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 18px;
          padding-bottom: 18px;
        }
        .nav-link {
          position: relative;
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.03em;
          color: var(--ink-soft);
          text-decoration: none;
        }
        .nav-link:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }

        .btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-display);
          font-size: 14px;
          font-weight: 600;
          padding: 11px 22px;
          border-radius: 2px;
          text-decoration: none;
          cursor: pointer;
          border: 1.5px solid var(--ink);
          transition: transform 120ms ease, box-shadow 120ms ease;
        }
        .btn-primary {
          background: var(--ink);
          color: var(--paper);
          box-shadow: 3px 3px 0 var(--rule-strong);
        }
        .btn-primary:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 var(--rule-strong); }
        .btn-secondary {
          color: var(--ink);
          background: transparent;
        }
        .btn-secondary:hover { background: var(--paper-raised); }
        .btn-nav {
          background: var(--ink);
          color: var(--paper);
          font-family: var(--font-display);
          font-size: 13px;
          font-weight: 600;
          padding: 8px 16px;
          border-radius: 2px;
          text-decoration: none;
        }

        .hero-section {
          padding-top: 64px;
          padding-bottom: 72px;
        }
        .hero-layout {
          display: grid;
          grid-template-columns: 1fr 0.86fr;
          gap: 56px;
          align-items: start;
        }
        .hero-eyebrow {
          font-family: var(--font-mono);
          font-size: 11.5px;
          letter-spacing: 0.08em;
          color: var(--ink-faint);
          text-transform: uppercase;
          margin-bottom: 18px;
        }
        .hero-title {
          font-family: var(--font-display);
          font-size: 44px;
          line-height: 1.14;
          margin: 0;
          letter-spacing: -0.01em;
          font-weight: 700;
        }
        .hero-title em {
          font-style: normal;
          box-shadow: inset 0 -0.32em 0 var(--stamp-amber-wash);
        }
        .hero-body {
          font-size: 15.5px;
          color: var(--ink-soft);
          margin-top: 22px;
          line-height: 1.65;
          max-width: 480px;
        }
        .hero-actions {
          display: flex;
          gap: 14px;
          margin-top: 32px;
        }

        /* -------------------- intake report card -------------------- */
        .report-sheet {
          position: relative;
          background: var(--paper-raised);
          border: 1.5px solid var(--ink);
          box-shadow: 6px 6px 0 var(--rule-strong);
          padding: 26px 26px 24px;
          transform: rotate(0.6deg);
        }
        .report-sheet > svg {
          position: absolute;
          top: -14px;
          left: 28px;
        }
        .report-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 16px;
          border-bottom: 1.5px solid var(--ink);
          margin-bottom: 18px;
        }
        .report-eyebrow { font-size: 10px; color: var(--ink-faint); letter-spacing: 0.08em; }
        .report-title { font-family: var(--font-display); font-size: 18px; font-weight: 700; margin-top: 4px; }
        .report-network { font-size: 10px; color: var(--ink-faint); letter-spacing: 0.08em; margin-top: 2px; }

        .report-field { display: flex; flex-direction: column; gap: 6px; }
        .report-field-label { font-size: 9.5px; color: var(--ink-faint); letter-spacing: 0.08em; }
        .report-field-value {
          font-size: 13.5px;
          color: var(--ink);
          display: inline-flex;
          align-items: center;
          word-break: break-all;
          border-bottom: 1px dotted var(--rule-strong);
          padding-bottom: 8px;
        }
        .report-cursor {
          display: inline-block;
          width: 7px; height: 14px;
          margin-left: 2px;
          background: var(--ink);
        }
        .report-cursor-blink { animation: blink 1s steps(1) infinite; }
        @keyframes blink { 50% { opacity: 0; } }

        .report-checks {
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-height: 76px;
        }
        .report-check-row {
          display: flex;
          align-items: center;
          gap: 9px;
          animation: fadeUp 240ms ease both;
        }
        .cf-check-danger { color: var(--stamp-red); border-color: var(--stamp-red); }
        .cf-check-safe { color: var(--stamp-green); border-color: var(--stamp-green); }
        .report-check-label { font-size: 12px; color: var(--ink-soft); }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .report-verdict {
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1.5px solid var(--ink);
          opacity: 0;
          transition: opacity 200ms ease;
        }
        .report-verdict-in { opacity: 1; }
        .report-verdict-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
        }
        .report-stamp { font-size: 15px; }
        .report-score { font-size: 26px; font-weight: 700; }
        .report-score-danger { color: var(--stamp-red); }
        .report-score-safe { color: var(--stamp-green); }
        .report-score-max { font-size: 12px; color: var(--ink-faint); font-weight: 500; }
        .report-evidence { margin-top: 12px; display: flex; flex-direction: column; gap: 5px; }
        .report-evidence-row { font-size: 11.5px; color: var(--ink-soft); }
        .report-recommendation {
          margin-top: 12px;
          font-family: var(--font-display);
          font-size: 13.5px;
          font-weight: 600;
          color: var(--ink);
        }

        /* -------------------- process -------------------- */
        .steps-list { display: flex; flex-direction: column; }
        .step-item {
          display: grid;
          grid-template-columns: 64px 1fr;
          gap: 22px;
          padding: 26px 0;
          border-top: 1px solid var(--rule);
        }
        .step-item:first-child { border-top: none; }
        .step-num {
          font-family: var(--font-display);
          font-size: 26px;
          font-weight: 700;
          color: var(--ink-faint);
        }
        .step-title { font-family: var(--font-display); font-size: 16.5px; font-weight: 600; margin-bottom: 8px; }
        .step-body { font-size: 13.5px; color: var(--ink-soft); line-height: 1.6; max-width: 560px; }

        /* -------------------- signals checklist -------------------- */
        .signals-list {
          display: grid;
          grid-template-columns: 1fr 1fr;
          column-gap: 40px;
        }
        .signal-row {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 0;
          border-top: 1px solid var(--rule);
        }
        .signals-list .signal-row:nth-child(1),
        .signals-list .signal-row:nth-child(2) { border-top: none; }
        .signal-label { font-size: 13.5px; color: var(--ink-soft); line-height: 1.55; padding-top: 1px; }

        .section-label {
          font-size: 11px;
          letter-spacing: 0.1em;
          color: var(--ink-faint);
          margin-bottom: 10px;
          text-transform: uppercase;
        }

        @media (max-width: 860px) {
          .hero-layout { grid-template-columns: 1fr; }
          .hero-title { font-size: 33px; }
          .signals-list { grid-template-columns: 1fr; }
          .signals-list .signal-row:nth-child(2) { border-top: 1px solid var(--rule); }
        }
        @media (max-width: 560px) {
          .landing-inner { padding-left: 20px; padding-right: 20px; }
          .step-item { grid-template-columns: 1fr; gap: 8px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .report-cursor-blink { animation: none; opacity: 1; }
          .report-check-row { animation: none; }
        }
      `}</style>

      <header className="landing-header">
        <div className="landing-inner landing-header-inner">
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div style={{
              width: 24, height: 24, border: "1.5px solid var(--ink)", display: "grid", placeItems: "center",
              transform: "rotate(-4deg)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13,
            }}>S</div>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, letterSpacing: "0.02em" }}>SENTRA</span>
          </div>
          <nav style={{ display: "flex", alignItems: "center", gap: 26 }}>
            <a href="#how-it-works" className="nav-link">HOW IT WORKS</a>
            <a href="#signals" className="nav-link">DETECTION</a>
            <Link to="/app" className="btn-nav">Launch App</Link>
          </nav>
        </div>
      </header>

      <section className="hero-section">
        <div className="landing-inner hero-layout">
          <div>
            <div className="hero-eyebrow">Detect the drain before the deposit</div>
            <h1 className="hero-title">
              Know if a wallet is safe to send to — <em>before you send</em>.
            </h1>
            <p className="hero-body">
              A compromised wallet can drain incoming funds in seconds, without its owner knowing.
              Sentra checks a wallet's real blockchain history for sweeper-bot behavior and gives you
              a risk score, evidence, and a clear recommendation — before the transfer is irreversible.
            </p>
            <div className="hero-actions">
              <Link to="/app" className="btn btn-primary">Check a wallet</Link>
              <a href="#how-it-works" className="btn btn-secondary">How it works</a>
            </div>
          </div>
          <IntakeReport />
        </div>
      </section>

      <section id="how-it-works" style={{ padding: "60px 0", borderTop: "2px solid var(--ink)" }}>
        <div className="landing-inner">
          <SectionLabel>How it works</SectionLabel>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 25, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
            Four steps, all on real data
          </h2>
          <div className="steps-list">
            {STEPS.map((s) => (
              <div className="step-item" key={s.n}>
                <div className="mono step-num">{s.n}</div>
                <div>
                  <div className="step-title">{s.title}</div>
                  <div className="step-body">{s.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="signals" style={{ padding: "60px 0", borderTop: "2px solid var(--ink)" }}>
        <div className="landing-inner">
          <SectionLabel>Detection engine</SectionLabel>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 25, margin: "0 0 12px", letterSpacing: "-0.01em" }}>
            No single transaction proves compromise.
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 8, maxWidth: 560, lineHeight: 1.6 }}>
            Sentra combines multiple independent signals and explains every one it detects — a score
            is never based on a single event alone. The inspection checklist below runs on every wallet.
          </p>
          <div className="signals-list">
            {SIGNALS.map((label) => (
              <div className="signal-row" key={label}>
                <span className="cf-check"><IconCheck size={10} /></span>
                <span className="signal-label">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "72px 0", borderTop: "2px solid var(--ink)", textAlign: "center" }}>
        <div className="landing-inner">
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 23, margin: "0 0 20px", letterSpacing: "-0.01em" }}>
            Check a wallet before you trust it with your funds.
          </h2>
          <Link to="/app" className="btn btn-primary">Launch App</Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
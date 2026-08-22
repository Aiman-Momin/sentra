# Sentra

**Detect the drain before the deposit.**

A non-custodial security platform that checks a crypto wallet's real
on-chain history for sweeper-bot behavior *before* you send it funds —
and gives you a risk score, the evidence behind it, and a clear
recommendation.

---

## Problem Statement

A crypto wallet can be compromised without its owner ever realizing it.
Attackers run **sweeper bots** — scripts that watch the blockchain for
incoming deposits to a wallet whose private key they've stolen (via
phishing, malware, a leaked seed phrase, etc.) and drain it within
seconds of anything arriving.

If you send funds to a wallet like this, you have no way of knowing it's
compromised. The transaction is irreversible. There's no dispute
process, no chargeback — the money is simply gone, moved on to an
attacker-controlled address before you've even finished refreshing the
page.

This is a silent, structural problem in crypto payments: **the sender
has no visibility into the recipient's safety**, and by the time
anyone notices something's wrong, it's too late.

## Solution

Sentra inspects a wallet's *real* transaction history before you send to
it, and looks for the specific behavioral fingerprint of an automated
sweep: deposits followed by near-instant, often repeated, often
full-balance withdrawals to the same destination. It scores that
behavior on a continuous 0–100 scale, explains exactly which signals
fired and why, and gives a plain recommendation: safe to send, or don't.

It's built as three separable layers — a pure risk-scoring engine, a
blockchain data layer that fetches real on-chain activity, and a UI —
so the detection logic can be trusted, tested, and reused independently
of how the data gets to it.

Sentra is **non-custodial**: it never asks for seed phrases, private
keys, or wallet passwords, and it never holds or moves funds itself. It
only reads publicly observable blockchain data and reports on it.

---

## Features

- **Wallet Check** — paste any address, get a real-time risk score,
  risk level (`NORMAL` / `SUSPICIOUS` / `HIGH_RISK` /
  `ACTIVE_SWEEPER_LIKELY`), the specific evidence behind it, and a full
  transaction timeline with the risky transactions highlighted.
- **Transfer Check (built into the same screen)** — add sender/asset/amount
  details before sending, and Sentra returns a hard **ALLOW / BLOCK**
  decision on top of the same risk analysis — mirroring what a real
  wallet, exchange, or payroll integration would get from
  `POST /api/check-transfer` at the moment someone hits "Send."
- **Wallet Monitoring** — add a wallet to be watched; Sentra re-checks it
  on a schedule (default every 5 minutes) and raises an **Alert** the
  moment new sweeper-like behavior appears, its score jumps, or a new
  repeated drain destination shows up.
- **Public API** — `POST /api/check-recipient` is built for direct
  integration into wallets, exchanges, payroll platforms, or other
  Web3 apps: send an address, get back a score, level, signals,
  evidence, and recommendation.
- **Graduated, explainable scoring** — no black box. Every point of the
  score maps to a named signal with a plain-English description and the
  exact transaction hashes that produced it. Speed of a deposit→drain
  pair scales the signal weight continuously (near-instant scores
  highest, tapering off through several minutes) rather than using a
  brittle single cutoff — so a bot that's a little slower than expected
  still gets flagged, just proportionally.
- **Controlled test harness** (`scripts/simulate-sweeper.mjs`) — a script
  that deposits funds into a wallet you control and immediately drains
  it back out, reproducing a real sweeper's timing pattern on demand
  against real mainnet transactions, instead of waiting on an actual
  attacker's bot to act (which is slow, unpredictable, and not a
  reliable way to test a detector).

## Detection Signals

The engine combines multiple independent signals rather than trusting
any single transaction — this is intentional: one fast withdrawal alone
shouldn't brand a wallet compromised, but several signals agreeing
should.

| Signal | What it catches |
|---|---|
| `FAST_DRAIN` | A deposit followed by an outgoing transfer shortly after, weighted by how fast |
| `REPEATED_FAST_DRAIN` | The above pattern happening more than once |
| `MULTI_ASSET_SWEEP` | Fast drains across more than one token/asset |
| `REPEATED_DESTINATION` | Drained funds repeatedly landing at the same address |
| `GAS_FUNDING_THEN_DRAIN` | Native-token top-up (gas funding) immediately followed by a token drain — a classic bot-funding pattern |
| `CONSISTENT_DRAIN_TIMING` | Deposit-to-drain gaps that are suspiciously uniform across multiple events — a hallmark of automation |
| `FULL_BALANCE_DRAIN` | The drained amount matches the deposit almost exactly, rather than a partial/unrelated spend |

---

## Tech Stack

**Frontend**
- React 18 + TypeScript
- Vite
- React Router

**Backend**
- Node.js + TypeScript
- Express
- ethers.js v6 (blockchain access)
- Prisma ORM
- node-cron (monitoring job)

**Database**
- PostgreSQL

**Blockchain**
- Polygon Mainnet (primary) and Polygon Amoy Testnet (supported)
- Alchemy as the RPC/data provider — Sentra uses Alchemy's indexed
  `alchemy_getAssetTransfers` API as its primary data path (fast,
  avoids free-tier `eth_getLogs` block-range limits), with a raw
  `eth_getLogs`-based fallback for non-Alchemy RPC providers

**Deployment**
- Frontend → Vercel
- Backend + Postgres → Render

---

## Architecture

```
packages/
  detection-engine/   pure risk-scoring logic, zero I/O, independently unit tested
  backend/             Express API — real ethers.js/Alchemy calls, Prisma/Postgres, monitoring cron
  frontend/            React + Vite UI
scripts/
  simulate-sweeper.mjs controlled real-transaction test harness (see below)
```

Data flows one way only:

```
real on-chain activity (Alchemy)
  → normalized transfers
  → detection engine (pure function, no I/O)
  → database (assessment history, monitored wallets, alerts)
  → API
  → frontend / any external API consumer
```

Nothing is hardcoded — no wallet addresses, no risk scores, no fake
transaction histories anywhere in the codebase. If a wallet has no
on-chain activity, Sentra reports `insufficientData: true` rather than
guessing.

---

## Setup Instructions

### Prerequisites
- Node.js 20+ (Node 22 recommended — the test script uses the native
  `--env-file` flag, available from Node 20.6)
- A PostgreSQL database (local via Docker/native install, or hosted)
- An [Alchemy](https://www.alchemy.com/) account with a Polygon Mainnet
  (and optionally Amoy Testnet) app created, for a real RPC URL

### 1. Install dependencies
```bash
npm install
```

### 2. Configure the backend
```bash
cp packages/backend/.env.example packages/backend/.env
```
Edit `packages/backend/.env` and set:
- `DATABASE_URL` — your Postgres connection string
- `SENTRA_RPC_POLYGON_MAINNET` — your real Alchemy Polygon Mainnet URL
- `SENTRA_RPC_POLYGON_AMOY` — (optional) your Alchemy Amoy Testnet URL

### 3. Set up the database
```bash
cd packages/backend
npx prisma generate
npx prisma migrate dev --name init
```

### 4. Build the detection engine
The backend imports the engine's compiled output, so build it first
(and any time you change its source):
```bash
cd packages/detection-engine
npm run build
```

### 5. Run it
```bash
# Terminal 1 — backend
cd packages/backend
npm run dev            # API on :4000

# Terminal 2 — frontend
cd packages/frontend
npm run dev            # UI on :5173
```

Open `http://localhost:5173`.

### 6. Run the test suite
```bash
npm run test:engine    # 9/9 detection engine unit tests
```


`.gitignore`, but always run `git status` before committing to confirm.

---

## Deployment

Sentra deploys as two separate services:

- **Backend** (Express + Prisma + Postgres + cron) → needs a host that
  runs a persistent Node process, not serverless functions — deployed
  here on **Render** (Web Service + managed Postgres).
- **Frontend** (static Vite build) → **Vercel**, with a `vercel.json`
  rewrite (`packages/frontend/vercel.json`) forwarding `/api/*` requests
  to the deployed Render backend URL, so the browser never needs CORS
  configuration and the frontend code doesn't need environment-specific
  API base URLs.



---

## Relevant Documentation & Resources

- [Alchemy — `alchemy_getAssetTransfers` API](https://docs.alchemy.com/reference/alchemy-getassettransfers) — the indexed transfer-history API Sentra's blockchain layer is built on
- [ethers.js v6 documentation](https://docs.ethers.org/v6/) — blockchain interaction library used throughout the backend
- [Prisma documentation](https://www.prisma.io/docs) — ORM/schema/migrations
- [Polygon Mainnet — Polygonscan](https://polygonscan.com/) — block explorer used for transaction links in the UI
- [Polygon Amoy Testnet — Polygonscan](https://amoy.polygonscan.com/) — testnet explorer
- [Vercel rewrites documentation](https://vercel.com/docs/edge-network/rewrites) — how `vercel.json` routes `/api/*` to the backend
- [Render Web Services documentation](https://render.com/docs/web-services) — backend hosting
- [Vitest documentation](https://vitest.dev/) — test runner used for the detection engine's unit tests

---


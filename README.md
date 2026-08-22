# Sentra

**Detect the drain before the deposit.**

Sentra checks a crypto wallet's real on-chain history for sweeper-bot
behavior before you send it funds, and gives you a risk score, evidence,
and a recommendation.

## Architecture

```
packages/
  detection-engine/   pure risk-scoring logic, zero I/O, unit tested
  backend/             Express API — real ethers.js RPC calls, Prisma/Postgres
  frontend/            React + Vite UI
```

Data only ever flows one way: **real RPC logs → normalized transfers →
detection engine → database → API → UI.** Nothing is hardcoded — no wallet
addresses, no risk scores, no fake transaction histories. If a wallet has
no on-chain activity, Sentra reports `insufficientData: true` rather than
guessing.

## What's implemented right now

- **Detection engine** (`packages/detection-engine`) — 7 independent
  sweeper-behavior signals (fast drain, repeated fast drain, multi-asset
  sweep, repeated destination, gas-funding-then-drain, consistent drain
  timing, full-balance drain), combined into a 0–100 score and a risk
  level. Fully unit tested (`npm run test:engine` — 8/8 passing).
- **Blockchain provider** (`packages/backend/src/blockchain/provider.ts`)
  — real `ethers.js` `JsonRpcProvider` calls against a configured RPC:
  ERC-20 `Transfer` log scanning + native-token transfer scanning,
  normalized into the engine's input format.
- **API** — `POST /api/check-recipient`, `POST /api/check-transfer`
  (sender-protection / block-before-send), `/api/monitor/*` (add/list/
  recheck monitored wallets, list alerts).
- **Monitoring job** — cron-based recheck of monitored wallets, raises
  `Alert` rows on new fast-drain patterns, score jumps, or new repeated
  destinations.
- **Frontend** — wallet-check screen (the core product screen), transfer
  check (sender protection), monitoring + alerts screen.

## What you need to supply to run this for real

1. **A real RPC endpoint** for Polygon Amoy testnet (Alchemy/Infura/etc.),
   set as `SENTRA_RPC_POLYGON_AMOY` in `packages/backend/.env`.
2. **A Postgres database**, set as `DATABASE_URL`.
3. **Controlled testnet wallets** you own, per the spec — to generate a
   real deposit → drain scenario Sentra can observe and score.

```bash
cp packages/backend/.env.example packages/backend/.env
# fill in DATABASE_URL and SENTRA_RPC_POLYGON_AMOY

cd packages/backend
npx prisma generate
npx prisma migrate dev --name init
npm run dev        # API on :4000

# in another terminal
cd packages/frontend
npm run dev         # UI on :5173, proxies /api to :4000
```

## Why some things aren't wired up in this environment

This codebase was built in a sandbox whose outbound network is restricted
to package registries (npm/pypi/github) — it cannot reach blockchain RPC
providers or `binaries.prisma.sh`. So:

- `prisma generate` needs to run once in an environment with normal
  network access (it downloads Prisma's query engine binary).
- End-to-end testing against real testnet transactions (the "controlled
  sweeper scenario" from the spec) needs to happen wherever you run this
  with a real `SENTRA_RPC_POLYGON_AMOY` value.

Everything that *could* be verified here — the detection engine's logic
(8/8 tests passing) and full TypeScript compilation of the backend and
frontend — has been.

## Extending

- **More chains**: add an entry to `KNOWN_TOKENS` / network config in
  `provider.ts` and set the matching `SENTRA_RPC_<NETWORK>` env var — the
  engine and API don't change.
- **Better native-transfer indexing**: swap the block-scanning loop in
  `provider.ts` for an indexer API (Polygonscan `txlist`, Alchemy
  `getAssetTransfers`) — see the note in that file.
- **New detection signals**: add a pure function to
  `detection-engine/src/signals.ts` and register it in `ALL_DETECTORS`;
  write a unit test the same way as the existing ones.

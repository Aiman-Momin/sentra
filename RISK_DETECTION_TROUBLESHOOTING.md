# Risk Detection Troubleshooting: Why Aren't All Sweeper Transactions Flagged?

## The Real Issue
**ALL transactions are being fetched correctly.** The problem is that **only some are being flagged as HIGH_RISK/ACTIVE_SWEEPER_LIKELY** on production, while localhost flags them all.

This is NOT a data ingestion problem. It's a **detection engine learning/context problem**.

## How the Detection Engine Works

### Path 1: Individual Signal Detection (Per-Wallet)
When analyzing a SINGLE wallet's history, the engine looks for:
- **FAST_DRAIN**: Deposit → withdraw within seconds (weighted by speed)
- **REPEATED_FAST_DRAIN**: Multiple fast drains over time
- **REPEATED_DESTINATION**: Multiple drains to the SAME address
- **MULTI_ASSET_SWEEP**: Fast drains across multiple tokens
- **GAS_FUNDING_THEN_DRAIN**: Native token top-up followed by token drain
- **CONSISTENT_DRAIN_TIMING**: Suspiciously uniform gaps
- **FULL_BALANCE_DRAIN**: Withdrawn amount ≈ deposited amount

**Scoring Rule:**
- Score ≥ 70 + 2+ signals → **ACTIVE_SWEEPER_LIKELY**
- Score ≥ 50 → **HIGH_RISK**
- Score > 0 → **SUSPICIOUS**
- Score = 0 → **NORMAL**

### Path 2: Known Sweeper Destinations (Cross-Wallet Memory)
When an address has been **previously confirmed as a sweeper destination**, any transfer to it fires the **KNOWN_SWEEPER_DESTINATION** signal:
- Confidence ≥ 0.6 = weight of ~21+ points
- Even a SINGLE transfer to a known-bad address gets flagged HIGH_RISK

### Path 3: Fingerprint Matching (Behavioral Clustering)
Sweeper bots have recognizable patterns (timing, assets, drain %, gas funding, active hours). Once a fingerprint exists with multiple matches, NEW wallets with similar patterns are immediately recognized.

---

## Why Only 1 Out of 3 Transactions Flagged on Production

### Transaction 1: ✅ Flagged
If these are separate wallets being checked:
- **Wallet 1** has multiple transfers to the sweeper address
- → Triggers **REPEATED_DESTINATION** signal (2+ drains to same address)
- → Triggers **REPEATED_FAST_DRAIN** signal (2+ fast drains)
- → Reaches HIGH_RISK/ACTIVE_SWEEPER_LIKELY ✓

### Transaction 2: ❌ Not Flagged
- **Wallet 2** has single/isolated transfer to same sweeper address
- → REPEATED_DESTINATION does NOT fire (only 1 drain in this check)
- → Sweeper address NOT in `KnownAddress` table yet (production DB is fresh)
- → KNOWN_SWEEPER_DESTINATION signal does NOT fire
- → Fingerprints don't match yet (no cluster established)
- → Result: NORMAL or SUSPICIOUS (not HIGH_RISK) ✗

### Transaction 3: ❌ Not Flagged
- Same as Transaction 2 ✗

### On Localhost: All 3 Flagged ✓
- Localhost DB accumulated learned addresses over time/testing
- Sweeper address already in `KnownAddress` table
- KNOWN_SWEEPER_DESTINATION signal fires immediately on ANY transfer to it
- All 3 get flagged regardless of individual wallet history

---

## Diagnostic Steps

### Step 1: Check If Transactions Are in the Same Wallet
If all 3 sweeper transactions are in **ONE wallet's history**:
```
Check wallet → should show all 3 transfers flagged
Because REPEATED_DESTINATION fires within that single check
```

If 3 **different wallets** each sent to the same sweeper address:
```
Check wallet 1 → might flag if has repeated patterns
Check wallet 2 → probably won't flag (no individual signals + address not learned)
Check wallet 3 → probably won't flag (same reason)
```

### Step 2: Monitor Render Logs
Deploy is active. Check logs for:

**Looking for:**
```
[risk] [polygon-mainnet] checking 0x...
[risk] [polygon-mainnet] detection context: 0 known sweeper destinations, 0 verified safe
[risk] [polygon-mainnet] wallet activity: 3 transfers
[risk] [polygon-mainnet] result: score=X, level=NORMAL, signals=0
```

**What this means:**
- `0 known sweeper destinations` = database is empty (expected on fresh deployment)
- `signals=0` = no individual signals fired for this wallet
- `level=NORMAL` = not flagged (but should have been if address was known-bad)

---

## How to Fix Production

### Quick Fix (Immediate): Enable Learning
When you see the first sweeper flagged on production:
1. Click "Report Verdict: Confirmed Sweeper" in the UI
2. This marks the destination as SWEEPER_DESTINATION in the database
3. Next wallet transferring to that same address gets flagged automatically

**After ~3-5 feedback confirmations:**
- Production has learned the most common sweeper addresses
- Detection works identically to localhost

### Better Fix (If You Have Localhost DB Backup)

Export learned addresses from localhost:
```bash
# On localhost, export the KnownAddress table
# Then import to production Render Postgres
```

### Complete Fix (Recommended): One Manual Confirmation Per Sweeper Type

1. For each sweeper bot type:
   - Check a victim wallet
   - If correctly flagged: Click "Confirmed Sweeper"
   - Production learns the destination address
   
2. The very next wallet transferred to that address: **Automatically flagged**

---

## Technical Details: Why This Happens

### Detection Engine Flow
```
wallet activity (on-chain transfers)
         ↓
    Detection context (learned addresses from DB)
         ↓
    Pure engine scoring:
      - Runs all 8 signal detectors
      - Computes signals + thresholds
      - Returns risk level
         ↓
    Result: Risk level, signals fired, recommendation
```

**Key insight:**
- Signatures like FAST_DRAIN, REPEATED_FAST_DRAIN depend on THIS wallet's history
- KNOWN_SWEEPER_DESTINATION depends on the DATABASE learning from OTHER wallets
- If DB is empty, cross-wallet memory is unavailable

### Why Localhost Works
```
Localhost setup:
- Runs for weeks during development
- Multiple test sweepers simulated (scripts/simulate-sweeper.mjs)
- Feedback submitted on each
- Database accumulated known-bad addresses

Production:
- Fresh database
- No prior learning history
- Builds knowledge incrementally as users submit feedback
```

---

## Logs to Watch (Deployed Now)

After redeployment, when you check a wallet, Render logs show:

```
[blockchain] [Alchemy] done in 250ms — 3 transfers found
[risk] [polygon-mainnet] checking 0x1234...
[risk] [polygon-mainnet] detection context: 0 known sweeper destinations, 0 verified safe
[risk] [polygon-mainnet] wallet activity: 3 transfers
[risk] [polygon-mainnet] result: score=85, level=ACTIVE_SWEEPER_LIKELY, signals=3
[risk] [polygon-mainnet]   - FAST_DRAIN (weight=28, evidence=2 txs)
[risk] [polygon-mainnet]   - REPEATED_DESTINATION (weight=25, evidence=2 txs)
[risk] [polygon-mainnet]   - FULL_BALANCE_DRAIN (weight=20, evidence=2 txs)
[learning] [polygon-mainnet] learning new sweeper destination: 0xabcd... (2 occurrences)
```

**Key indicators:**
- `signals=0, level=NORMAL` → Transaction not flagged (needs learning or stronger signals)
- `signals=3+, level=HIGH_RISK` → Correctly flagged
- `learning new sweeper destination` → Database is building knowledge
- `detection context: 0 known sweeper destinations` → DB is still fresh

---

## Summary

| Scenario | Localhost | Production (Fresh) | After Feedback |
|----------|-----------|-------------------|-----------------|
| Same wallet, 3 drains to address A | ✓ Flags all 3 | ✓ Flags all 3 | ✓ Flags all 3 |
| Wallet 1 → A, Wallet 2 → A, Wallet 3 → A | ✓ All flagged | ✓1, ❌2, ❌3 | ✓✓✓ All flagged |
| After manual confirmation | N/A | N/A | ✓ Auto-flags new transfers to A |

**TL;DR**: Submit feedback on detected sweeper once → production learns the destination address → all future transfers to that address auto-flag.

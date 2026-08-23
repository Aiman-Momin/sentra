# Production Deployment Guide: Complete Transaction Detection

## Problem Summary

**Deployed website missing incoming/outgoing transactions that appear correctly on localhost.**

### Root Cause
The backend has two blockchain data ingestion paths:
1. **Alchemy Path** (enabled by setting SENTRA_RPC_* to Alchemy URL): Full coverage of native POL + ERC-20 transfers
2. **Raw RPC Fallback** (when RPC URL is not Alchemy): ERC-20 only, missing all native POL transfers

If the production Render backend environment variables are not configured or point to a non-Alchemy RPC, it silently falls back to the incomplete ERC-20-only path, explaining the missing transactions.

## Quick Fix Checklist

### Step 1: Verify Current Deployment Status
```bash
# Check if backend is responsive
curl https://sentra-backend-v3rc.onrender.com/api/health
# Should return: {"status":"ok"}
```

### Step 2: Check Render Environment Variables
1. Go to [Render Dashboard](https://render.com)
2. Click on "sentra-backend-v3rc" service
3. Click "Environment" tab
4. Verify `SENTRA_RPC_POLYGON_MAINNET` exists and is set to an **Alchemy URL**

### Step 3: Set Correct RPC URL
If `SENTRA_RPC_POLYGON_MAINNET` is missing or set to a non-Alchemy URL:

1. **Obtain Alchemy API Key** (if you don't have one):
   - Go to [Alchemy Dashboard](https://dashboard.alchemy.com)
   - Create a new app for Polygon Mainnet
   - Copy the HTTP API key

2. **Update Render Environment Variables**:
   - Set `SENTRA_RPC_POLYGON_MAINNET` to:
     ```
     https://polygon-mainnet.g.alchemy.com/v2/{YOUR_API_KEY}
     ```
   - If using Polygon Amoy testnet, also set:
     ```
     SENTRA_RPC_POLYGON_AMOY=https://polygon-amoy.g.alchemy.com/v2/{YOUR_API_KEY}
     ```

3. **Trigger Redeployment**:
   - Render will automatically redeploy when environment variables change
   - Monitor the "Logs" tab until deployment completes

### Step 4: Verify Complete Transfer Detection
1. Go to deployed website: https://sentra-website.vercel.app
2. Check a wallet address that has both:
   - Native POL transfers (incoming and/or outgoing)
   - ERC-20 token transfers
3. Verify ALL transfers are shown (not just tokens)

## Diagnostic Logging

The backend now logs which RPC path is being used:

### ✅ Correct Configuration (Alchemy)
```
[blockchain] [Alchemy] done in 150ms — 12 transfers found
```
This means all native + ERC-20 transfers are being detected.

### ⚠️ Incomplete Configuration (Non-Alchemy RPC)
```
[blockchain] RPC endpoint is not Alchemy. Native POL transfers will not be scanned...
[blockchain] Using raw eth_getLogs fallback (note: ERC-20 only, native transfers excluded)
[blockchain] [raw RPC (ERC-20 only)] done in 200ms — 8 transfers found
```
This means only ERC-20 transfers are detected; native POL transfers are missing.

### To View Logs on Render
1. Go to Render Dashboard → sentra-backend-v3rc
2. Click "Logs" tab
3. Filter for `[blockchain]` to see transfer detection logs
4. Each wallet check will produce logs showing which path was used

## Technical Details

### File Structure
- **Entry Point**: `packages/backend/src/blockchain/provider.ts`
- **Key Functions**:
  - `fetchWalletActivity()` (line 336): Routes to Alchemy or raw RPC based on environment
  - `isAlchemyEndpoint()` (line 94): Determines which path to use
  - `fetchViaAlchemy()` (line 201): Full coverage path
  - `fetchViaRawRpc()` (line 281): ERC-20 only fallback

### Environment Variables Required
```bash
# Required for Polygon Mainnet (production)
SENTRA_RPC_POLYGON_MAINNET=https://polygon-mainnet.g.alchemy.com/v2/{KEY}

# Optional but recommended for testnet
SENTRA_RPC_POLYGON_AMOY=https://polygon-amoy.g.alchemy.com/v2/{KEY}

# Database (should already be configured)
DATABASE_URL=postgresql://...

# Optional: Override lookback block range (default: 2000 blocks)
SENTRA_LOOKBACK_BLOCKS_POLYGON_MAINNET=5000
```

### Why Alchemy?
- **Alchemy_getAssetTransfers API**: Single indexed call retrieves all native + token transfers, paginated
- **Performance**: 1-2 API calls vs hundreds of raw eth_getLogs calls
- **Reliability**: Free tier supports full wallet history scanning
- **Coverage**: Officially supported for exactly this use case

## Troubleshooting

### Transfers still not showing after fix
1. **Verify logs** show `[blockchain] [Alchemy]` (not raw RPC)
2. **Clear browser cache**: Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
3. **Wait for Alchemy sync**: First check may take a bit longer as data is fresh
4. **Check wallet address**: Verify you're entering the correct checksummed address

### Still seeing ERC-20 only despite setting Alchemy
1. Render may not have picked up environment change yet
2. **Manually trigger redeploy**: In Render dashboard, click "Deploy" button
3. **Wait for deployment**: Watch logs until "Deploy successful"
4. **Retry wallet check** after deployment completes

### API Key issues
- **Invalid key**: Check exact key format in Alchemy dashboard
- **Rate limited**: Upgrade Alchemy plan if checking very frequently
- **Wrong network**: Ensure URL matches configured network (mainnet vs amoy)

## Performance Notes
- Alchemy path: ~100-300ms per wallet check
- Raw RPC fallback: ~200-500ms per wallet check (also incomplete)
- Transfer history is cached in Postgres after first check
- Subsequent checks for same wallet return cached result (instant)

## Next Steps
1. Verify environment variables on Render
2. Update SENTRA_RPC_* to valid Alchemy URL if needed
3. Trigger redeployment
4. Test with a known wallet address
5. Confirm logs show `[blockchain] [Alchemy]` path being used

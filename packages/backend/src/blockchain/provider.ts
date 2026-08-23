import { ethers } from "ethers";
import type { NormalizedTransfer, WalletActivity } from "@sentra/detection-engine";

/**
 * Real blockchain data layer. This module is the ONLY place in the backend
 * that talks to an RPC endpoint. Everything downstream (detection engine,
 * API, DB) only ever sees NormalizedTransfer[] built from real on-chain
 * data fetched here.
 *
 * No hardcoded addresses, no fake histories. If the provider has nothing
 * for a wallet, we return an empty transfer list and the engine correctly
 * reports "insufficientData".
 *
 * STRATEGY:
 * If the configured RPC URL is an Alchemy endpoint, we use Alchemy's
 * `alchemy_getAssetTransfers` API — a single indexed call per direction
 * that returns a wallet's full native + ERC-20 transfer history, paginated.
 * This is the officially supported way to do exactly what Sentra needs,
 * and avoids the free-tier wall you hit with raw eth_getLogs/eth_getBlock
 * scanning (10-block range caps, low compute-units-per-second budgets,
 * hundreds of requests for one wallet check).
 *
 * For non-Alchemy RPCs, we fall back to raw eth_getLogs (chunked) for
 * ERC-20 transfers and skip native-transfer scanning (flagged via a
 * console warning) — see `fetchViaRawRpc` below. Swap in your provider's
 * equivalent indexed API (Infura doesn't have one; Etherscan/Polygonscan
 * "txlist" does) if you're not on Alchemy.
 */

const ERC20_TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

interface KnownToken {
  address: string;
  symbol: string;
  decimals: number;
}

function loadKnownTokensFromEnv(network: string): KnownToken[] {
  const envVar = `SENTRA_KNOWN_TOKENS_${network.toUpperCase().replace(/-/g, "_")}`;
  const raw = process.env[envVar];
  if (!raw) return [];
  try {
    return JSON.parse(raw) as KnownToken[];
  } catch {
    console.warn(`Failed to parse ${envVar} as JSON, ignoring`);
    return [];
  }
}

export interface NetworkConfig {
  key: string;
  chainId: number;
  rpcUrl: string;
  nativeSymbol: string;
  nativeDecimals: number;
  /** how many blocks back to scan, only used by the raw-RPC fallback path */
  lookbackBlocks: number;
}

function getNetworkConfig(network: string): NetworkConfig {
  const upper = network.toUpperCase().replace(/-/g, "_");
  const rpcUrl = process.env[`SENTRA_RPC_${upper}`];
  if (!rpcUrl) {
    throw new Error(
      `No RPC URL configured for network "${network}". Set SENTRA_RPC_${upper} in your environment.`
    );
  }

  const lookbackOverride = process.env[`SENTRA_LOOKBACK_BLOCKS_${upper}`];
  const defaultLookback = 2_000;

  const configs: Record<string, Omit<NetworkConfig, "rpcUrl" | "key" | "lookbackBlocks">> = {
    "polygon-mainnet": { chainId: 137, nativeSymbol: "POL", nativeDecimals: 18 },
    "polygon-amoy": { chainId: 80002, nativeSymbol: "POL", nativeDecimals: 18 },
  };

  const base = configs[network];
  if (!base) throw new Error(`Unsupported network "${network}".`);
  const lookbackBlocks = lookbackOverride ? parseInt(lookbackOverride, 10) : defaultLookback;
  return { key: network, rpcUrl, lookbackBlocks, ...base };
}

let providerCache = new Map<string, ethers.JsonRpcProvider>();

function getProvider(network: string): ethers.JsonRpcProvider {
  const cached = providerCache.get(network);
  if (cached) return cached;
  const config = getNetworkConfig(network);
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  providerCache.set(network, provider);
  return provider;
}

function isAlchemyEndpoint(rpcUrl: string): boolean {
  const isAlchemy = rpcUrl.includes("alchemy.com");
  if (!isAlchemy) {
    console.warn(
      "[blockchain] RPC endpoint is not Alchemy. Native POL transfers will not be scanned. " +
      "For complete transfer coverage, set SENTRA_RPC_* to an Alchemy endpoint URL (e.g., https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY)"
    );
  }
  return isAlchemy;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  const e = err as { code?: unknown; error?: { code?: unknown }; info?: { error?: { code?: unknown } } };
  const code = e?.code ?? e?.error?.code ?? e?.info?.error?.code;
  return code === 429 || code === "429" || String((err as Error)?.message ?? "").includes("compute units");
}

async function withRateLimitRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimitError(err) || attempt >= maxRetries) throw err;
      const delay = Math.min(500 * 2 ** attempt, 8000) + Math.random() * 200;
      attempt++;
      console.warn(`[blockchain] rate limited, retrying in ${Math.round(delay)}ms (attempt ${attempt}/${maxRetries})`);
      await sleep(delay);
    }
  }
}

// --- Alchemy alchemy_getAssetTransfers path (primary) ---------------------

interface AlchemyTransfer {
  blockNum: string; // hex
  hash: string;
  from: string;
  to: string | null;
  value: number | null;
  asset: string | null;
  category: "external" | "internal" | "erc20" | "erc721" | "erc1155" | "specialnft";
  rawContract: { value: string | null; address: string | null; decimal: string | null };
  metadata?: { blockTimestamp?: string };
}

interface AlchemyGetAssetTransfersResult {
  transfers: AlchemyTransfer[];
  pageKey?: string;
}

async function fetchAssetTransfersPage(
  provider: ethers.JsonRpcProvider,
  params: Record<string, unknown>
): Promise<AlchemyTransfer[]> {
  const all: AlchemyTransfer[] = [];
  let pageKey: string | undefined;

  do {
    const result = (await withRateLimitRetry(() =>
      provider.send("alchemy_getAssetTransfers", [{ ...params, ...(pageKey ? { pageKey } : {}) }])
    )) as AlchemyGetAssetTransfersResult;
    all.push(...result.transfers);
    pageKey = result.pageKey;
  } while (pageKey);

  return all;
}

function alchemyTransferToNormalized(
  t: AlchemyTransfer,
  address: string,
  config: NetworkConfig,
  tokensByAddress: Map<string, KnownToken>
): NormalizedTransfer | null {
  if (!t.to) return null; // contract-creation txs etc — not a wallet-to-wallet transfer
  const direction: "IN" | "OUT" = t.to.toLowerCase() === address.toLowerCase() ? "IN" : "OUT";
  const counterparty = direction === "IN" ? t.from : t.to;
  const isNativeAsset = t.category === "external" || t.category === "internal";

  let amount: string;
  let asset: string;
  if (isNativeAsset) {
    amount = (t.value ?? 0).toString();
    asset = config.nativeSymbol;
  } else {
    const contractAddress = (t.rawContract.address ?? "").toLowerCase();
    const known = tokensByAddress.get(contractAddress);
    asset = t.asset ?? known?.symbol ?? contractAddress;
    if (t.value !== null) {
      amount = t.value.toString();
    } else if (t.rawContract.value && t.rawContract.decimal) {
      amount = ethers.formatUnits(t.rawContract.value, parseInt(t.rawContract.decimal, 16));
    } else {
      amount = "0";
    }
  }

  const timestamp = t.metadata?.blockTimestamp
    ? Math.floor(new Date(t.metadata.blockTimestamp).getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  return {
    txHash: t.hash,
    timestamp,
    blockNumber: parseInt(t.blockNum, 16),
    direction,
    asset,
    amount,
    counterparty,
    isNativeAsset,
  };
}

async function fetchViaAlchemy(
  provider: ethers.JsonRpcProvider,
  address: string,
  config: NetworkConfig
): Promise<NormalizedTransfer[]> {
  const knownTokens = loadKnownTokensFromEnv(config.key);
  const tokensByAddress = new Map(knownTokens.map((t) => [t.address.toLowerCase(), t]));

  const categories = ["external", "internal", "erc20"];
  const [incoming, outgoing] = await Promise.all([
    fetchAssetTransfersPage(provider, {
      toAddress: address,
      category: categories,
      withMetadata: true,
      order: "desc",
      maxCount: "0x3e8", // 1000
    }),
    fetchAssetTransfersPage(provider, {
      fromAddress: address,
      category: categories,
      withMetadata: true,
      order: "desc",
      maxCount: "0x3e8",
    }),
  ]);

  const normalized: NormalizedTransfer[] = [];
  for (const t of [...incoming, ...outgoing]) {
    const n = alchemyTransferToNormalized(t, address, config, tokensByAddress);
    if (n) normalized.push(n);
  }
  return normalized;
}

// --- Raw JSON-RPC fallback (non-Alchemy providers) -------------------------
// ERC-20 transfers only, via chunked eth_getLogs. No native-transfer
// scanning (that requires either a wide eth_getBlock scan — slow on free
// tiers — or an indexed API most non-Alchemy free RPCs don't offer).

const DEFAULT_GETLOGS_CHUNK_SIZE = 10;
function getLogsChunkSize(): number {
  const raw = process.env.SENTRA_GETLOGS_CHUNK_SIZE;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GETLOGS_CHUNK_SIZE;
}

const DEFAULT_CONCURRENCY = 2;
function getConcurrency(): number {
  const raw = process.env.SENTRA_RPC_CONCURRENCY;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONCURRENCY;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await withRateLimitRetry(() => fn(items[i]));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchViaRawRpc(
  provider: ethers.JsonRpcProvider,
  address: string,
  config: NetworkConfig
): Promise<NormalizedTransfer[]> {
  console.log("[blockchain] Using raw eth_getLogs fallback (note: ERC-20 only, native transfers excluded)");

  const knownTokens = loadKnownTokensFromEnv(config.key);
  const tokensByAddress = new Map(knownTokens.map((t) => [t.address.toLowerCase(), t]));

  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - config.lookbackBlocks);
  const chunkSize = getLogsChunkSize();
  const ranges: Array<[number, number]> = [];
  for (let start = fromBlock; start <= latestBlock; start += chunkSize) {
    ranges.push([start, Math.min(start + chunkSize - 1, latestBlock)]);
  }

  const paddedAddress = ethers.zeroPadValue(address, 32);
  async function getLogsChunked(topics: (string | null)[]): Promise<ethers.Log[]> {
    const chunkResults = await mapWithConcurrency(ranges, getConcurrency(), ([start, end]) =>
      provider.getLogs({ fromBlock: start, toBlock: end, topics })
    );
    return chunkResults.flat();
  }

  const [incomingLogs, outgoingLogs] = await Promise.all([
    getLogsChunked([ERC20_TRANSFER_TOPIC, null, paddedAddress]),
    getLogsChunked([ERC20_TRANSFER_TOPIC, paddedAddress, null]),
  ]);
  const allLogs = [...incomingLogs, ...outgoingLogs];

  const blockNumbers = [...new Set(allLogs.map((l) => l.blockNumber))];
  const blocks = await mapWithConcurrency(blockNumbers, getConcurrency(), (bn) => provider.getBlock(bn));
  const timestampByBlock = new Map(blockNumbers.map((bn, i) => [bn, blocks[i]?.timestamp ?? Math.floor(Date.now() / 1000)]));

  return allLogs.map((log) => {
    const tokenAddress = log.address.toLowerCase();
    const known = tokensByAddress.get(tokenAddress);
    const from = ethers.getAddress("0x" + log.topics[1].slice(26));
    const to = ethers.getAddress("0x" + log.topics[2].slice(26));
    const direction: "IN" | "OUT" = to.toLowerCase() === address.toLowerCase() ? "IN" : "OUT";
    const amount = known ? ethers.formatUnits(log.data, known.decimals) : BigInt(log.data).toString();
    return {
      txHash: log.transactionHash,
      timestamp: timestampByBlock.get(log.blockNumber) ?? Math.floor(Date.now() / 1000),
      blockNumber: log.blockNumber,
      direction,
      asset: known ? known.symbol : tokenAddress,
      amount,
      counterparty: direction === "IN" ? from : to,
      isNativeAsset: false,
    };
  });
}

// --- public entry point -----------------------------------------------------

export async function fetchWalletActivity(address: string, network: string): Promise<WalletActivity> {
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }
  const config = getNetworkConfig(network);
  const provider = getProvider(network);

  console.log(`[blockchain] fetching activity for ${address} on ${network}`);
  const startedAt = Date.now();

  const transfers = isAlchemyEndpoint(config.rpcUrl)
    ? await fetchViaAlchemy(provider, address, config)
    : await fetchViaRawRpc(provider, address, config);

  const provider_type = isAlchemyEndpoint(config.rpcUrl) ? "Alchemy" : "raw RPC (ERC-20 only)";
  console.log(`[blockchain] [${provider_type}] done in ${Date.now() - startedAt}ms — ${transfers.length} transfers found`);

  return {
    address,
    network,
    transfers,
    fetchedAt: Math.floor(Date.now() / 1000),
  };
}

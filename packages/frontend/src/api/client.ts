export type RiskLevel = "NORMAL" | "SUSPICIOUS" | "HIGH_RISK" | "ACTIVE_SWEEPER_LIKELY";

export interface NormalizedTransfer {
  txHash: string;
  timestamp: number;
  blockNumber: number;
  direction: "IN" | "OUT";
  asset: string;
  amount: string;
  counterparty: string;
  isNativeAsset: boolean;
}

export interface RiskSignal {
  id: string;
  description: string;
  weight: number;
  evidenceTxHashes: string[];
}

export interface RiskResult {
  address: string;
  network: string;
  riskScore: number;
  riskLevel: RiskLevel;
  recommendation: string;
  signals: RiskSignal[];
  timeline: NormalizedTransfer[];
  analyzedAt: number;
  insufficientData: boolean;
}

export interface TransferCheckResult {
  decision: "ALLOW" | "BLOCK";
  senderWallet: string;
  recipientWallet: string;
  asset: string;
  amount: string;
  risk: RiskResult;
}

export interface MonitoredWallet {
  id: string;
  address: string;
  network: string;
  label: string | null;
  createdAt: string;
  lastCheckedAt: string | null;
  lastRiskScore: number | null;
  lastRiskLevel: RiskLevel | null;
}

export interface Alert {
  id: string;
  monitoredWalletId: string;
  type: string;
  message: string;
  previousScore: number | null;
  newScore: number | null;
  createdAt: string;
}

class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.message ?? body.error ?? `Request failed (${res.status})`, res.status);
  }
  return res.json();
}

export const api = {
  checkRecipient: (address: string, network: string) =>
    request<RiskResult>("/check-recipient", { method: "POST", body: JSON.stringify({ address, network }) }),

  checkTransfer: (input: { senderWallet: string; recipientWallet: string; network: string; asset: string; amount: string }) =>
    request<TransferCheckResult>("/check-transfer", { method: "POST", body: JSON.stringify(input) }),

  listMonitoredWallets: () => request<MonitoredWallet[]>("/monitor/wallets"),

  addMonitoredWallet: (address: string, network: string, label?: string) =>
    request<MonitoredWallet>("/monitor/wallets", { method: "POST", body: JSON.stringify({ address, network, label }) }),

  removeMonitoredWallet: (id: string) => request<void>(`/monitor/wallets/${id}`, { method: "DELETE" }),

  recheckMonitoredWallet: (id: string) => request<RiskResult>(`/monitor/wallets/${id}/recheck`, { method: "POST" }),

  listAlerts: (walletId?: string) => request<Alert[]>(`/monitor/alerts${walletId ? `?walletId=${walletId}` : ""}`),
};

export { ApiError };

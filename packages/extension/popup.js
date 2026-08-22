// Sentra browser extension — on-demand page scanner.
//
// Nothing runs automatically on pages you visit. Scanning only happens
// when you click "Scan This Page", using Chrome's `activeTab` permission,
// which grants temporary access to the current tab ONLY because of that
// explicit user action — the extension has no standing access to your
// browsing otherwise.
//
// Every address found gets checked against Sentra's real API
// (POST /api/check-recipient) — no cached fake data, no local scoring.

const DEFAULT_API_BASE_URL = "https://sentra-backend-v3rc.onrender.com";
const DEFAULT_WEBAPP_URL = "https://sentra-frontend-three.vercel.app";
const MAX_ADDRESSES_PER_SCAN = 15;

const scanBtn = document.getElementById("scan-btn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const networkSelect = document.getElementById("network");
const settingsToggle = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("settings");
const apiBaseUrlInput = document.getElementById("api-base-url");
const webappUrlInput = document.getElementById("webapp-url");
const saveSettingsBtn = document.getElementById("save-settings");

function truncate(addr) {
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

function setStatus(text) {
  statusEl.textContent = text;
}

async function getSettings() {
  const stored = await chrome.storage.local.get(["apiBaseUrl", "webappUrl"]);
  return {
    apiBaseUrl: stored.apiBaseUrl || DEFAULT_API_BASE_URL,
    webappUrl: stored.webappUrl || DEFAULT_WEBAPP_URL,
  };
}

/**
 * Injected into the active tab (only on click, via activeTab). Scans
 * visible text AND common input/textarea fields (many exchange/DApp
 * "recipient address" fields don't put the address in visible text, only
 * in an input's value) for anything matching an EVM address shape.
 * Returns a deduped list, capped so a pathological page can't produce
 * hundreds of API calls.
 */
function extractAddressesFromPage(maxCount) {
  const ADDRESS_RE = /0x[a-fA-F0-9]{40}/g;
  const found = new Set();

  const bodyText = document.body ? document.body.innerText || "" : "";
  for (const match of bodyText.matchAll(ADDRESS_RE)) {
    found.add(match[0]);
    if (found.size >= maxCount) break;
  }

  if (found.size < maxCount) {
    const fields = document.querySelectorAll("input, textarea");
    for (const field of fields) {
      const value = field.value || "";
      for (const match of value.matchAll(ADDRESS_RE)) {
        found.add(match[0]);
        if (found.size >= maxCount) break;
      }
      if (found.size >= maxCount) break;
    }
  }

  return [...found];
}

async function scanActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found.");

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractAddressesFromPage,
    args: [MAX_ADDRESSES_PER_SCAN],
  });

  return injection?.result ?? [];
}

async function checkAddress(apiBaseUrl, address, network) {
  const res = await fetch(`${apiBaseUrl}/api/check-recipient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, network }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function renderEmpty(message) {
  resultsEl.innerHTML = `<div class="empty">${message}</div>`;
}

function renderResultCard(address, webappUrl, network) {
  const card = document.createElement("div");
  card.className = "result-card";
  card.innerHTML = `
    <div class="result-address">${address}</div>
    <div class="result-row">
      <span class="badge" id="badge-${address}">Checking…</span>
      <span class="score" id="score-${address}"></span>
    </div>
    <a class="view-report" href="${webappUrl}/?address=${address}&network=${network}" target="_blank" id="link-${address}">
      View full report →
    </a>
  `;
  resultsEl.appendChild(card);
}

function updateResultCard(address, result, error) {
  const badge = document.getElementById(`badge-${address}`);
  const score = document.getElementById(`score-${address}`);
  if (!badge) return;

  if (error) {
    badge.textContent = "Check failed";
    badge.className = "badge badge-error";
    score.textContent = "";
    return;
  }

  if (result.insufficientData) {
    badge.textContent = "No history";
    badge.className = "badge badge-normal";
    score.textContent = "";
    return;
  }

  const levelClass = result.riskLevel.toLowerCase();
  badge.textContent = result.riskLevel.replace(/_/g, " ");
  badge.className = `badge badge-${levelClass}`;
  score.textContent = `${result.riskScore}/100`;
}

async function runScan() {
  scanBtn.disabled = true;
  resultsEl.innerHTML = "";
  setStatus("Scanning page for addresses…");

  try {
    const { apiBaseUrl, webappUrl } = await getSettings();
    const network = networkSelect.value;
    const addresses = await scanActiveTab();

    if (addresses.length === 0) {
      setStatus("");
      renderEmpty("No wallet addresses found on this page.");
      scanBtn.disabled = false;
      return;
    }

    setStatus(`Found ${addresses.length} address${addresses.length > 1 ? "es" : ""} — checking with Sentra…`);

    for (const address of addresses) {
      renderResultCard(address, webappUrl, network);
    }

    // Check concurrently, but update each card as its own result lands —
    // one slow/failed check shouldn't hold up the others.
    await Promise.all(
      addresses.map(async (address) => {
        try {
          const result = await checkAddress(apiBaseUrl, address, network);
          updateResultCard(address, result, null);
        } catch (err) {
          updateResultCard(address, null, err);
        }
      })
    );

    setStatus(`Done — ${addresses.length} address${addresses.length > 1 ? "es" : ""} checked.`);
  } catch (err) {
    setStatus("");
    renderEmpty(err instanceof Error ? err.message : "Something went wrong scanning this page.");
  } finally {
    scanBtn.disabled = false;
  }
}

async function initSettingsPanel() {
  const { apiBaseUrl, webappUrl } = await getSettings();
  apiBaseUrlInput.value = apiBaseUrl;
  webappUrlInput.value = webappUrl;
}

settingsToggle.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

saveSettingsBtn.addEventListener("click", async () => {
  await chrome.storage.local.set({
    apiBaseUrl: apiBaseUrlInput.value.trim() || DEFAULT_API_BASE_URL,
    webappUrl: webappUrlInput.value.trim() || DEFAULT_WEBAPP_URL,
  });
  setStatus("Settings saved.");
  setTimeout(() => setStatus(""), 1500);
});

scanBtn.addEventListener("click", runScan);

initSettingsPanel();
renderEmpty("Click \"Scan This Page\" to check any wallet addresses on it.");
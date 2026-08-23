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
 * Deterministic short "case file" reference derived from the address —
 * cosmetic only, purely to match the web app's dossier styling. Not
 * stored anywhere, not meaningful beyond this popup.
 */
function caseFileRef(address) {
  const tail = address.slice(-4).toUpperCase();
  return `SNT-${tail}`;
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

/** Initial "pending" state — the checklist reads as still-in-progress. */
function renderResultCard(address, network) {
  const card = document.createElement("div");
  card.className = "case-file";
  card.id = `case-${address}`;
  card.innerHTML = `
    <span class="paperclip">📎</span>
    <div class="case-file-header">
      <span class="case-file-id mono">CASE FILE NO. ${caseFileRef(address)}</span>
      <span class="case-file-network mono">${network === "polygon-mainnet" ? "POLYGON" : "AMOY"}</span>
    </div>
    <div class="case-file-label">SUBJECT ADDRESS</div>
    <div class="case-file-address">${address}</div>
    <div class="checklist">
      <div class="checklist-item"><span class="checkbox spinning">·</span> Reading on-chain history</div>
      <div class="checklist-item"><span class="checkbox spinning">·</span> Checking detection signals</div>
    </div>
    <div class="verdict-row">
      <span class="stamp stamp-pending">SCANNING</span>
      <span class="score"></span>
    </div>
    <div class="findings findings-empty" id="findings-${address}">Awaiting result…</div>
  `;
  resultsEl.appendChild(card);
}

function stampFor(riskLevel) {
  switch (riskLevel) {
    case "ACTIVE_SWEEPER_LIKELY":
      return { text: "DO NOT SEND", cls: "stamp-flagged" };
    case "HIGH_RISK":
      return { text: "FLAGGED", cls: "stamp-flagged" };
    case "SUSPICIOUS":
      return { text: "CAUTION", cls: "stamp-caution" };
    default:
      return { text: "CLEARED", cls: "stamp-cleared" };
  }
}

function updateResultCard(address, result, error) {
  const card = document.getElementById(`case-${address}`);
  if (!card) return;

  const checkboxes = card.querySelectorAll(".checkbox");
  const verdictRow = card.querySelector(".verdict-row");
  const findingsEl = document.getElementById(`findings-${address}`);

  if (error) {
    checkboxes.forEach((cb) => {
      cb.className = "checkbox";
      cb.textContent = "!";
    });
    verdictRow.innerHTML = `<span class="stamp stamp-pending">ERROR</span><span class="score"></span>`;
    findingsEl.className = "findings findings-empty";
    findingsEl.textContent = error.message || "Could not reach Sentra.";
    return;
  }

  checkboxes.forEach((cb) => {
    cb.className = "checkbox checked";
    cb.textContent = "✓";
  });

  const stamp = stampFor(result.riskLevel);
  verdictRow.innerHTML = `
    <span class="stamp ${stamp.cls}">${stamp.text}</span>
    <span class="score">${result.riskScore}<span class="score-max">/100</span></span>
  `;

  if (result.insufficientData) {
    findingsEl.className = "findings findings-empty";
    findingsEl.textContent = "No on-chain history found in the scanned window.";
  } else if (result.signals.length === 0) {
    findingsEl.className = "findings findings-empty";
    findingsEl.textContent = "No sweeper-bot signals detected.";
  } else {
    findingsEl.className = "findings";
    let html = result.signals.map((s) => `· ${s.description}`).join("<br/>");
    if (result.fingerprint && !result.fingerprint.isNewFingerprint) {
      html += `<br/><br/><strong style="color:var(--stamp-red)">PATTERN ${result.fingerprint.label}</strong> — detected across ${result.fingerprint.victimCount} unique wallet${result.fingerprint.victimCount === 1 ? "" : "s"}`;
    }
    findingsEl.innerHTML = html;
  }
}

function addViewReportLink(address, network, webappUrl) {
  const card = document.getElementById(`case-${address}`);
  if (!card) return;
  const link = document.createElement("a");
  link.className = "view-report";
  link.href = `${webappUrl}/?address=${address}&network=${network}`;
  link.target = "_blank";
  link.textContent = "VIEW FULL REPORT →";
  card.appendChild(link);
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
      renderResultCard(address, network);
    }

    // Check concurrently, but update each card as its own result lands —
    // one slow/failed check shouldn't hold up the others.
    await Promise.all(
      addresses.map(async (address) => {
        try {
          const result = await checkAddress(apiBaseUrl, address, network);
          updateResultCard(address, result, null);
          addViewReportLink(address, network, webappUrl);
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
renderEmpty("Click \u201cScan This Page\u201d to check any wallet addresses on it.");
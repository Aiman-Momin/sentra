# Sentra Browser Extension

On-demand wallet risk scanning for whatever page you're on — exchange
withdrawal screens, DApp connect popups, payment forms. Click the
extension icon, click "Scan This Page," and every address found gets
checked against Sentra's real API.

**Nothing runs automatically.** The extension only reads the current
page when you explicitly click "Scan This Page" — that's what
`activeTab` permission means: temporary, one-click-triggered access to
the tab you're looking at, nothing standing or persistent.

## How it works

1. You click **Scan This Page**
2. A script runs once in the current tab, looking for anything shaped
   like an EVM address (`0x` + 40 hex characters) in the page's visible
   text and in any `<input>`/`<textarea>` field values — this catches
   addresses inside "recipient address" form fields that don't show up
   in plain page text
3. Each address found gets sent to `POST /api/check-recipient` on your
   real deployed backend. When labeled sender, recipient, asset, and
   amount fields are present, the extension sends the complete context to
   `POST /api/check-transfer` instead.
4. Results render right in the popup — risk level, score, and a clear
   `DO NOT PROCEED` warning for high-risk transaction context. Sentra does
   not submit, block, or alter the transaction.
5. Results include a "View
   full report" link that opens the full evidence/timeline view on the
   main Sentra web app

## Install it locally (unpacked)

1. Open Chrome (or any Chromium browser) and go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this `extension` folder
5. The Sentra icon should appear in your toolbar — pin it for easy access

## Configuration

By default it points at:
- API: `https://sentra-backend-v3rc.onrender.com`
- Web app (for "view full report" links): `https://sentra-frontend-three.vercel.app`

If either URL changes (e.g. you redeploy to a new Render/Vercel URL),
click **Settings** in the popup and update them — saved via
`chrome.storage.local`, no rebuild needed.

## Limitations, honestly

- Address *shape* detection is a regex (`0x` + 40 hex chars) — it can't
  tell a real recipient-address field from, say, a transaction hash or
  contract address quoted in an article on the page. It'll check
  whatever matches the pattern; irrelevant matches just come back
  `insufficientData` or low-risk, they don't cause errors.
- Capped at 15 addresses per scan, to avoid a busy page (e.g. a block
  explorer) triggering a wall of API calls at once.
- No content script runs persistently — the addresses-extraction
  function is injected fresh via `chrome.scripting.executeScript` on
  every click, and Chrome tears it down afterward. There's no
  always-on page monitoring here by design (see the on-demand-only
  decision this was scoped to).

## Publishing to the Chrome Web Store (later)

This is currently unpacked/developer-mode only. To actually publish it:
1. Zip the `extension` folder's contents (not the folder itself)
2. Create a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole) (one-time $5 fee)
3. Upload the zip, fill in store listing details, submit for review
4. Review typically takes a few days; extensions requesting broad host
   permissions get extra scrutiny — this one only requests
   `activeTab`/`scripting`/`storage` plus your own backend's domain,
   which is about as narrow as a scanner extension can be
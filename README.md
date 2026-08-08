<div align="center">
  <img src="public/zenexpander-leaf.png" width="88" alt="ZenExpander paired-leaf logo">
  <h1>ZenExpander</h1>
  <p><strong>A calm, private text expander that lives in Chrome—no installation required.</strong></p>
  <p>
    <a href="https://jiannystein.github.io/zenexpander/"><strong>Open ZenExpander</strong></a>
    ·
    <a href="#one-minute-setup">Quick start</a>
    ·
    <a href="SECURITY.md">Security</a>
  </p>
  <p>
    <a href="https://github.com/jiannystein/zenexpander/actions/workflows/deploy-pages.yml"><img alt="GitHub Pages" src="https://img.shields.io/github/actions/workflow/status/jiannystein/zenexpander/deploy-pages.yml?branch=main&label=GitHub%20Pages&style=flat-square&color=009999"></a>
    <img alt="Chrome first" src="https://img.shields.io/badge/Chrome-first-6b245f?style=flat-square">
    <img alt="No installation" src="https://img.shields.io/badge/install-none-009999?style=flat-square">
    <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-6b245f?style=flat-square"></a>
  </p>
</div>

ZenExpander brings Espanso-style shortcuts to company-managed Chrome devices without an executable, extension, account, or server. Build snippets visually, keep them in this browser, and open a compact search widget from a bookmarklet.

```text
;hello    →  Hello, how are you?
;options  →  Choose Meal and Side, then confirm
;bye      →  Goodbye  /  Bye bye  /  See you
```

## Why ZenExpander

- **Layman-friendly editing.** Direct text, dropdown choices, and random replies—no YAML or scripting.
- **Local by design.** Configuration is stored in this site’s Chrome IndexedDB and can be exported as readable JSON.
- **Deliberate activation.** The bookmarklet runs only after the user clicks it on the current page.
- **Safe text handling.** Saved content is inserted as literal text; password, payment, and one-time-code fields are excluded.
- **Zero account infrastructure.** No login, analytics, telemetry, remote sync, content logging, or configuration upload.

## One-minute setup

1. Open the [live configurator](https://jiannystein.github.io/zenexpander/) and choose **Create local config**.
2. Open **Setup** and press `Ctrl+Shift+B` to show Chrome’s bookmarks bar.
3. Drag the **ZenExpander** button to the bookmarks bar. Do not click it.
4. Keep the configurator open, visit a trusted page, and click the bookmark once for that tab or reload.
5. Type `;hello`, or press `Ctrl+Shift+Space`, and select an expansion.

For Google Chat, test only in the message composer. Confirm that the expanded words appear, then clear the draft—do not press Send.

> [!TIP]
> Bookmarklets contain a snapshot of the widget. After a ZenExpander update, remove the old bookmark and drag the current one into the bookmarks bar again.

## Privacy boundary

ZenExpander does not send saved configuration to a ZenExpander server—there is no application backend. The configurator is a static GitHub Pages site, durable data stays in the browser, and the bridge keeps only a session-memory copy while the widget is connected.

> [!WARNING]
> A bookmarklet runs inside the active page. When activated, the page runtime receives the saved expansion catalog so it can search locally. The active page is therefore **not a confidentiality boundary**: do not store passwords, secrets, authentication codes, personal records, or other sensitive material, and activate ZenExpander only on pages you trust.

Browser storage is origin-specific. A future Cloudflare Pages mirror will have separate local data and will require an explicit config export/import. See [SECURITY.md](SECURITY.md) for the complete model and reporting instructions.

## How it works

```text
Configurator tab
IndexedDB source of truth + visual editor
        │ validated data only
        ▼
Same-origin SharedWorker
session-memory bridge
        │ transferred MessagePort
        ▼
Bookmarklet widget
search, choose, insert literal text
```

The browser cannot silently discover a config file on the desktop. Explicit JSON export/import is the recovery and transfer path; IndexedDB is the automatic local source of truth.

## Current MVP limits

- Chrome desktop first; other browsers come later.
- The bookmarklet is page-scoped and must be activated again after navigation or reload.
- Managed-browser policy, page Content Security Policy, or complex web editors may block bookmarklets or direct insertion.
- If direct insertion fails, ZenExpander copies only the selected final text and asks the user to press `Ctrl+V`.
- Keep the configurator open during the current browser session; reopen it after a browser restart.

## Development

Requirements: Node.js 20 or newer and npm.

```powershell
npm install
npm run dev
```

Run the complete pre-release gate:

```powershell
npm run check
```

That command audits dependencies, runs unit tests, rebuilds the bookmarklet within its 32 KiB budget, creates the static app in `dist/client`, and checks the release artifact for accidental local data or server scaffolding.

GitHub Pages is the canonical host and deploys `dist/client` through [the release workflow](.github/workflows/deploy-pages.yml). Cloudflare Pages can later mirror the same static directory.

## Product research

The UX and scope were informed by official product capabilities from Espanso, Beeftext, AutoHotkey, and Lintalist. The comparison and MVP trade-offs are documented in [docs/product-review.md](docs/product-review.md).

## License

Released under the [MIT License](LICENSE).

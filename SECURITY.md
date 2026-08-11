# Security policy

ZenExpander is a static, local-first Chrome and Edge bookmarklet application. It has no application backend, user accounts, telemetry, remote sync, or content logging.

## Supported version

Security updates are applied to the latest revision on the `main` branch and the current GitHub Pages deployment.

## Data and trust model

- Durable configuration is stored in the GitHub Pages origin's browser IndexedDB.
- Export and import are explicit user actions. Imports are JSON-only, schema-validated, size-limited to 1 MB, and cannot contain executable configuration.
- The bridge stores the latest validated config, session-consented exact origins, and runtime connections only in browser session memory.
- ZenExpander inserts literal text and disables itself in password, payment, and one-time-code fields.
- ZenExpander never reads the clipboard. It may write only the selected final text when direct insertion fails.

Bookmarklets execute inside the active page's JavaScript environment. Activating ZenExpander transfers the saved expansion catalog to that page runtime for local search. This means the active page is not an isolation or confidentiality boundary.

Optional new-tab access extends that same trust decision to compatible windows opened by the activated page. It is off by default, requires inline confirmation of the exact scheme/hostname/port, and resets with the browser session. Child runtimes request the catalog only when first used. Stopping access prevents future propagation but does not terminate widgets already running.

ZenExpander calls the site's native `window.open` implementation unchanged and proceeds only when it receives a usable same-origin window reference. It does not rewrite anchors, navigation, routing, targets, or opener policy. Cross-origin, subdomain, different-port, sandboxed, `noopener`, inaccessible, and browser-managed windows remain outside the feature and require manual bookmarklet activation.

**Do not save secrets or sensitive personal information in ZenExpander. Activate it—and enable new tabs—only on origins you trust. Exact origin is a propagation boundary, not a confidentiality guarantee.**

## Report a vulnerability

Please use [GitHub's private vulnerability reporting](https://github.com/jiannystein/zenexpander/security/advisories/new). Include the affected URL or file, reproduction steps, impact, and any suggested remediation. Do not open a public issue for an unpatched vulnerability.

For general bugs that do not expose security-sensitive details, use the repository issue tracker.

## Out of scope

- Managed-browser policies that intentionally disable JavaScript bookmarks.
- Sandboxed or cross-origin iframe editors and closed shadow roots that the browser intentionally isolates from the active page.
- A malicious page reading data after the user deliberately activates the bookmarklet on that page; this is a documented platform boundary, although reductions in exposed data are welcome.
- A trusted page deliberately opening an inaccessible or isolated window that browser security prevents the source runtime from registering.
- Social engineering that asks users to replace the official bookmarklet with unrelated JavaScript.

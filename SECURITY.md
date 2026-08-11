# Security policy

ZenExpander is a static, local-first Chrome and Edge bookmarklet application. It has no application backend, user accounts, telemetry, remote sync, or content logging.

## Supported version

Security updates are applied to the latest revision on the `main` branch and the current GitHub Pages deployment.

## Data and trust model

- Durable configuration is stored in the GitHub Pages origin's browser IndexedDB.
- Export and import are explicit user actions. Imports are JSON-only, schema-validated, size-limited to 1 MB, and cannot contain executable configuration.
- The bridge stores the latest validated config only in browser session memory.
- ZenExpander inserts literal text and disables itself in password, payment, and one-time-code fields.
- ZenExpander never reads the clipboard. It may write only the selected final text when direct insertion fails.

Bookmarklets execute inside the active page's JavaScript environment. Activating ZenExpander transfers the saved expansion catalog to that page runtime for local search. This means the active page is not an isolation or confidentiality boundary.

**Do not save secrets or sensitive personal information in ZenExpander. Activate it only on pages you trust.**

## Report a vulnerability

Please use [GitHub's private vulnerability reporting](https://github.com/jiannystein/zenexpander/security/advisories/new). Include the affected URL or file, reproduction steps, impact, and any suggested remediation. Do not open a public issue for an unpatched vulnerability.

For general bugs that do not expose security-sensitive details, use the repository issue tracker.

## Out of scope

- Managed-browser policies that intentionally disable JavaScript bookmarks.
- Sandboxed or cross-origin iframe editors and closed shadow roots that the browser intentionally isolates from the active page.
- A malicious page reading data after the user deliberately activates the bookmarklet on that page; this is a documented platform boundary, although reductions in exposed data are welcome.
- Social engineering that asks users to replace the official bookmarklet with unrelated JavaScript.

# Product review and ZenExpander decisions

Reviewed against official project documentation on 2026-08-08.

| Product | Strong idea to learn from | Why ZenExpander does not copy the full model |
| --- | --- | --- |
| [Espanso](https://espanso.org/) | Trigger replacement, Alt+Space search, forms, and cross-platform reach form the clearest benchmark. | Espanso is an installed system-wide tool with file-based configuration and optional shell/script execution. ZenExpander deliberately stays browser-scoped and data-only. |
| [Beeftext](https://github.com/xmichelo/Beeftext) | A visual combo manager and picker make basic snippet work approachable. | Beeftext is Windows software and its repository states that it is in maintenance mode. ZenExpander keeps the visual authoring model but requires no binary. |
| [AutoHotkey hotstrings](https://ahkscript.github.io/pt/docs/lib/Hotstring.htm) | Hotstrings are flexible, context-aware, and deeply configurable. | AutoHotkey installs keyboard hooks and can execute functions/scripts. That power conflicts with the managed-machine and non-executable-config boundary. |
| [Lintalist](https://lintalist.github.io/) | Incremental search, a compact/narrow picker, choice fields, randomization, and keyboard navigation are valuable interaction patterns. | Lintalist runs on AutoHotkey, supports executable snippets, and defaults to CapsLock search. ZenExpander adopts searchable choices while keeping CapsLock opt-in and experimental. |

## Product-layer conclusion

ZenExpander is not a system-wide text expander. A bookmarklet cannot monitor Chrome globally or persist across navigation without being invoked on the page. The MVP instead owns a narrower promise:

- zero-install, page-scoped expansion after deliberate bookmarklet activation;
- a visual, non-YAML configurator for direct, choice, and equal-random snippets;
- prefix discovery and a configurable search shortcut while the widget is active;
- direct insertion in compatible web editors with copy-and-manual-paste fallback;
- no accounts, remote sync, telemetry, clipboard reads, or executable configuration.

This scope is the correct privacy and deployment trade-off for company-managed Chrome. A browser extension can later add persistent activation and broader site compatibility without changing the versioned configuration format.

## UX decisions carried into the MVP

- Espanso’s “every sentence one search away” model becomes Ctrl+Shift+Space plus `;` discovery.
- Beeftext’s combo-manager clarity becomes an editor with expansion tabs, labeled types, and an import preview.
- Lintalist’s searchable picker and choice plugin become a compact result menu and a full-sentence confirmation step for dropdown fields.
- AutoHotkey’s executable branch is intentionally excluded: ZenExpander config is literal text data only.

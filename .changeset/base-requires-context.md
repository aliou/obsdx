---
"@aliou/obsdx-base-ast": minor
"@aliou/obsdx-base-engine": patch
"@aliou/obsdx-index": patch
---

Add `requiresContext` boolean field to `BaseView` indicating whether a view needs a `--context` reference. Views require context when their filters, base-level filters, or any formula references the `this` keyword. Detection uses AST walking to avoid false positives from string/regex literals. `parseBase` now resolves context requirements internally. Improved `base inspect` human output to show properties, formulas, filters, and per-view details including context requirements.

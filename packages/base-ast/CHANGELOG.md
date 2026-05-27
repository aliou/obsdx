# @aliou/obsdx-base-ast

## 0.1.0

### Minor Changes

- e109dd9: Add `requiresContext` boolean field to `BaseView` indicating whether a view needs a `--context` reference. Views require context when their filters, base-level filters, or any formula references the `this` keyword. Detection uses AST walking to avoid false positives from string/regex literals. `parseBase` now resolves context requirements internally. Improved `base inspect` human output to show properties, formulas, filters, and per-view details including context requirements.
- b1efd6b: Add `@aliou/obsdx-index` package containing the shared vault index abstraction: domain types, write DTOs (`MarkdownIndexInput`, `BaseIndexInput`), and the `VaultIndexStore` interface. The SQLite implementation now lives behind `openSqliteVaultIndex` in the CLI.

## 0.0.7

### Patch Changes

- b8738dd: Clarify Bases documentation around the `this` keyword and the active file used as its formula context.

## 0.0.6

### Patch Changes

- e04a37e: Prepare public npm publishing for the Base AST and engine packages.

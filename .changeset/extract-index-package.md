---
"@aliou/obsdx-base-ast": minor
"@aliou/obsdx-base-engine": minor
"@aliou/obsdx-index": minor
---

Add `@aliou/obsdx-index` package containing the shared vault index abstraction: domain types, write DTOs (`MarkdownIndexInput`, `BaseIndexInput`), and the `VaultIndexStore` interface. The SQLite implementation now lives behind `openSqliteVaultIndex` in the CLI.

# @aliou/obsdx-cli

## 0.2.0

### Minor Changes

- be64844: Add a standalone Linux x86_64 CLI binary to release builds.

### Patch Changes

- 7902780: Fix link resolution for NFC/NFD Unicode mismatches and self-referencing anchor links

  - Normalize all link resolution indexes and lookups to NFC, so wikilinks written in NFC resolve correctly against files stored as NFD (e.g., macOS APFS).
  - Self-referencing anchor links (`[text](#fragment)`, `[[#heading]]`) now resolve to their source file instead of being marked unresolved.

- fc35986: Fix property value filtering for booleans and numbers

  The `properties files --name <name> --value <value>` command now correctly matches boolean and numeric property values. Previously, `--value true` was compared as the JSON string `"true"` instead of the JSON boolean `true`, causing matches to fail. The SQL query now uses a dual comparison (`json_quote(?) or ?`) so both JSON-quoted strings and raw JSON primitives match correctly.

  - @aliou/obsdx-base-ast@0.2.0
  - @aliou/obsdx-base-engine@0.2.0
  - @aliou/obsdx-index@0.2.0

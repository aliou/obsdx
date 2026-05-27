---
"@aliou/obsdx-cli": patch
---

Fix property value filtering for booleans and numbers

The `properties files --name <name> --value <value>` command now correctly matches boolean and numeric property values. Previously, `--value true` was compared as the JSON string `"true"` instead of the JSON boolean `true`, causing matches to fail. The SQL query now uses a dual comparison (`json_quote(?) or ?`) so both JSON-quoted strings and raw JSON primitives match correctly.

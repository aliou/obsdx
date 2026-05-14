# Exit Codes and Error Codes

obsdx exits with code 1 on any error. The `code` field in JSON error output identifies the error category.

## ObsdxError Codes

| Code | Trigger |
|---|---|
| `FILE_NOT_FOUND` | File path not found in the vault index |
| `VAULT_NOT_FOUND` | No vault root could be discovered (env, flag, cwd walk all failed) |
| `CACHE_LOCK_TIMEOUT` | `index.lock` could not be acquired within `--lock-timeout` |
| `DAEMON_ALREADY_RUNNING` | `daemon start` but a daemon is already active for this vault |
| `BASE_NOT_FOUND` | `.base` file path not found in the vault index |
| `CANVAS_NOT_FOUND` | `.canvas` file path not found in the vault index |
| `SEARCH_QUERY_REQUIRED` | `search` invoked without a query or `--regex` |
| `INVALID_OPTION` | A flag has an invalid value (e.g. non-numeric `--limit`) |
| `INTERNAL_ERROR` | Unexpected/unhandled error |

## BaseEngineError Codes (from base-engine, normalized at CLI boundary)

Base evaluation errors carry codes from the `@aliou/obsdx-base-engine` package. They are normalized into `ObsdxError` at the CLI boundary, preserving the original `code` and `message`.

## Error Output

- Human mode: `<CODE>: <message>` to stderr, exit 1
- JSON mode: `{ "error": { "code": "<CODE>", "message": "...", "details": {} } }` to stderr, exit 1

---
name: obsdx
description: "Query and analyze Obsidian vaults headlessly via the obsdx CLI. Use when working with .md, .canvas, or .base files in an Obsidian vault, resolving wikilinks, inspecting vault graphs, querying Bases, or automating vault operations from the command line."
---

# obsdx — Headless Obsidian Vault Intelligence

## Setup

The binary runs from PATH. If not installed, build from source:

```bash
pnpm build          # builds library + CLI + SEA binaries
pnpm dev -- <cmd>   # run via tsx during development
```

SEA binaries appear at `packages/cli/dist/obsdx-{darwin,linux}-arm64`.

## Vault Discovery

The CLI finds the vault root by checking, in order:

1. `OBSDX_VAULT` environment variable
2. `--vault <path>` flag
3. Walking up from cwd to find a directory containing `.obsidian/`

## Global Flags

Every command accepts:

| Flag | Description |
|---|---|
| `--vault <path>` | Explicit vault root |
| `--json` | Machine-readable JSON output |
| `--pretty` | Pretty-print JSON (with `--json`) |
| `--ndjson` | Newline-delimited JSON where applicable |
| `--no-cache` | Bypass cache, scan directly |
| `--refresh` | Refresh stale cache entries first |
| `--rebuild-cache` | Rebuild cache first |
| `--quiet` | Suppress non-error human output |
| `--verbose` | Diagnostic output to stderr |
| `--lock-timeout <ms>` | Cache index lock timeout (default 30s) |

## Commands

### vault

```
obsdx vault info                  # Print resolved vault root, cache dir, config
```

### index

```
obsdx index build                 # Create or update the vault cache
obsdx index rebuild               # Clear and rebuild
obsdx index refresh               # Incrementally refresh stale entries
obsdx index status                # Cache freshness (indexed / stale / deleted)
obsdx index vacuum                # Vacuum the SQLite cache
obsdx index watch                 # Watch and refresh on change (--ndjson for streaming)
```

### daemon

```
obsdx daemon start                # Start background index daemon
obsdx daemon stop                 # Stop the daemon
obsdx daemon status               # Check if running
```

### files

```
obsdx files list [--folder F] [--ext E]    # List vault files
obsdx files stat <path>                    # Inspect one file
obsdx files changed                        # Files changed since last index
```

### read / inspect

```
obsdx read <path>                 # Read a vault file's content
obsdx inspect <path>              # Indexed metadata (properties, tags, links, headings)
```

### links

```
obsdx links outgoing <path>       # Outgoing links from a file
obsdx links backlinks <path>      # Backlinks to a file
obsdx links resolve <input> --from <path>  # Resolve a raw link from a source file
obsdx links unresolved            # All unresolved links
obsdx links ambiguous             # All ambiguous links
obsdx links mentions <query>      # Files that mention a path or text
```

### search

```
obsdx search <query>              # Full-text search
  [--regex] [--folder F] [--ext E] [--tag T]
  [--property P] [--path P] [--linked-to P] [--links-from P] [--limit N]
```

### base

```
obsdx base list                   # List .base files
obsdx base inspect <path>         # Inspect a base's views
obsdx base validate <path>        # Validate a base file
obsdx base views <path>           # List view names
obsdx base query <path> [--view V] [--context C]  # Execute a base query
obsdx base render-embed <path>    # Render Base embeds in a markdown file
```

### graph

```
obsdx graph export                                    # All nodes and edges
obsdx graph neighborhood <path> [--depth N] [--direction D]  # Subgraph around a path
obsdx graph shortest-path <from> <to>                 # Shortest directed path
obsdx graph components                                 # Connected components
obsdx graph orphans                                    # Files with no resolved edges
obsdx graph unresolved                                 # Unresolved links in graph context
```

### canvas

```
obsdx canvas list                 # List .canvas files
obsdx canvas inspect <path>       # Nodes and edges in a canvas
obsdx canvas graph <path>         # Extract graph edges from a canvas
```

### tags

```
obsdx tags list [--counts]        # List indexed tags
obsdx tags files <tag>            # Files with a tag
obsdx tags tree                   # Nested tag hierarchy
```

### properties

```
obsdx properties list             # List indexed properties with counts
obsdx properties get <path>      # Properties for a vault file
obsdx properties files --name <N> [--value V]  # Files matching a property
```

## Output

- Human output goes to stdout; logs and errors go to stderr.
- With `--json`, stdout is always valid JSON. Never mix text into JSON output.
- With `--ndjson`, each line is a self-contained JSON object.

## Error Handling

Errors use `ObsdxError` with machine-readable codes:

| Code | Meaning |
|---|---|
| `FILE_NOT_FOUND` | Vault file not in index |
| `VAULT_NOT_FOUND` | No vault root discovered |
| `CACHE_LOCK_TIMEOUT` | Could not acquire index lock |
| `DAEMON_ALREADY_RUNNING` | Daemon already active |
| `BASE_NOT_FOUND` | Base file not in index |
| `CANVAS_NOT_FOUND` | Canvas file not in index |
| `SEARCH_QUERY_REQUIRED` | Search needs a query or --regex |
| `INVALID_OPTION` | Bad flag value |
| `INTERNAL_ERROR` | Unexpected error |

In JSON mode, errors flow to stderr as `{ "error": { "code", "message", "details" } }`.

## Cache

- Location: `<vault>/.obsidian/obsdx/` (SQLite + daemon state + lock)
- Lock file: `index.lock` with configurable timeout
- `--no-cache` bypasses SQLite and scans the vault directly
- `--refresh` and `--rebuild-cache` force cache operations before the command runs

## Common Patterns

Find all files linking to a note:
```bash
obsdx links backlinks "projects/alpha.md" --json
```

Find orphaned notes (no links in or out):
```bash
obsdx graph orphans --json
```

Search by tag and property:
```bash
obsdx search "" --tag project --property "status=active" --json
```

Watch for changes in CI:
```bash
obsdx index watch --ndjson
```

Resolve a wikilink as Obsidian would:
```bash
obsdx links resolve "[[My Note]]" --from "daily/2025-01-01.md" --json
```

## References

- **JSON output shapes**: See [references/JSON_SHAPES.md](references/JSON_SHAPES.md) for exact `--json` output shapes per command.
- **Error codes**: See [references/ERRORS.md](references/ERRORS.md) for all error codes and their meanings.

# AGENTS.md

## Project

`obsdx` is a headless Obsidian vault intelligence CLI. It reads vault files directly, keeps a vault-local SQLite cache under `.obsidian/obsdx/`, and emits deterministic human or JSON output.

This is a personal tool for the user. There are no any other external users to support, so do not spend time preserving backward compatibility unless it clearly benefits current development.

## Package Layout

### `packages/cli` — `@aliou/obsdx-cli`

The main CLI binary. Owns:
- The Brocli command surface and global option handling.
- Vault discovery (`OBSDX_VAULT` env, cwd walk, `--vault` flag), config loading (`app.json`, `types.json`).
- The SQLite cache layer (`node:sqlite` `DatabaseSync`) with file-level locking.
- The vault scanner (`fast-glob`) and incremental indexer with stale/deleted tracking.
- The file watcher (`chokidar`) and background daemon process management.
- Markdown parsing: frontmatter, properties, wikilinks, markdown links, embeds, tags, headings, block references.
- The resolved vault graph (nodes, edges, neighborhoods, connected components, shortest paths, orphans).
- Canvas file parsing and graph extraction.
- Shell completion via `@bomb.sh/tab`.
- Integration and e2e tests using local fixtures.

### `packages/base-ast` — `@aliou/obsdx-base-ast`

`.base` YAML parsing. Owns:
- `parseBase` / `validateBase` for Base definitions, views, filters, sorts, group-by, and property configs.
- Filter syntax parsing (and/or/not, property comparisons).
- Formula expression lexer and recursive-descent parser producing a typed AST (`Expr`).

### `packages/base-engine` — `@aliou/obsdx-base-engine`

Base evaluation and query execution. Owns:
- Expression evaluation against a pluggable `EvaluationContext`.
- `queryBase` entry point accepting a Base definition, view name, and optional active file path used for the `this` keyword.
- Date/time, duration, string, number, link, and global function support.
- Accuracy tests verified against Obsidian CLI Base behavior using local fixture vaults.

## CLI Commands

All commands accept global flags: `--vault`, `--json`, `--pretty`, `--ndjson`, `--no-cache`, `--refresh`, `--rebuild-cache`, `--quiet`, `--verbose`, `--lock-timeout`.

| Command | Subcommands | Description |
|---|---|---|
| `vault info` | — | Print resolved vault root, cache dir, and config |
| `index build` | — | Create or update the vault cache |
| `index rebuild` | — | Clear and rebuild the cache |
| `index refresh` | — | Incrementally refresh stale entries |
| `index status` | — | Report cache freshness (indexed, stale, deleted) |
| `index vacuum` | — | Vacuum the SQLite cache |
| `index watch` | — | Watch vault files and refresh on change (supports `--ndjson`) |
| `daemon start` | — | Start the background index daemon |
| `daemon stop` | — | Stop the background index daemon |
| `daemon status` | — | Check if the daemon is running |
| `files list` | `--folder`, `--ext` | List vault files |
| `files stat <path>` | — | Inspect one vault file |
| `files changed` | — | List files changed since last index |
| `read <path>` | — | Read a vault file's content |
| `inspect <path>` | — | Indexed metadata summary (properties, tags, links, headings) |
| `links outgoing <path>` | — | Outgoing links from a file |
| `links backlinks <path>` | — | Backlinks to a file |
| `links resolve <input> --from <path>` | — | Resolve a raw link as it appears in a source file |
| `links unresolved` | — | List all unresolved links |
| `links ambiguous` | — | List all ambiguous links |
| `links mentions <query>` | — | Files that mention a path or text |
| `search <query>` | `--regex`, `--folder`, `--ext`, `--tag`, `--property`, `--path`, `--linked-to`, `--links-from`, `--limit` | Search indexed markdown files |
| `base list` | — | List `.base` files |
| `base inspect <path>` | — | Inspect a base file's views |
| `base validate <path>` | — | Validate a base file |
| `base views <path>` | — | List view names in a base |
| `base query <path>` | `--view`, `--context` | Execute a base query; `--context` supplies the active file for `this` |
| `base render-embed <path>` | — | Render Base embeds in a markdown file |
| `graph export` | — | Export all graph nodes and edges |
| `graph neighborhood <path>` | `--depth`, `--direction` | Subgraph around a path |
| `graph shortest-path <from> <to>` | — | Find shortest directed path |
| `graph components` | — | List connected components |
| `graph orphans` | — | List files with no resolved graph edges |
| `graph unresolved` | — | List unresolved links in graph context |
| `canvas list` | — | List `.canvas` files |
| `canvas inspect <path>` | — | Inspect a canvas file's nodes and edges |
| `canvas graph <path>` | — | Extract graph edges from a canvas file |
| `tags list` | `--counts` | List indexed tags |
| `tags files <tag>` | — | List files with a tag |
| `tags tree` | — | Nested tag hierarchy |
| `properties list` | — | List indexed properties with counts |
| `properties get <path>` | — | Get properties for a vault file |
| `properties files --name <name>` | `--value` | List files matching a property |

## Error Handling

All errors use `ObsdxError` with a machine-readable `code` (e.g. `FILE_NOT_FOUND`, `VAULT_NOT_FOUND`, `CACHE_LOCK_TIMEOUT`, `DAEMON_ALREADY_RUNNING`). In JSON mode, errors go to stderr as `{ error: { code, message, details } }`. `BaseEngineError` from `base-engine` is normalized into `ObsdxError` at the CLI boundary.

## Implementation Direction

- Use TypeScript on Node.js (>=25.7.0).
- Use `@drizzle-team/brocli` for command definitions.
- Use `@clack/prompts` for interactive prompts only (via `assertNotCancelled` helper).
- Use `@bomb.sh/args` for raw argv parsing helpers where Brocli is not the right layer.
- Use `@bomb.sh/tab` for shell completions.
- Use `node:sqlite` (`DatabaseSync`) for the persistent cache.
- Use `yaml` for frontmatter and `.base` parsing.
- Use `chokidar` for `index watch`.
- Use `fast-glob` for vault scanning.
- Use `turbo` for workspace task orchestration.
- Use `vitest` for unit and integration tests.
- Use `tsdown` for building; `tsdown.sea.config.ts` produces a standalone `obsdx` binary (Node SEA) for macOS/Linux arm64.
- Do not launch Obsidian, Electron, or any GUI process.

## Vault Cache

- Cache lives at `<vault>/.obsidian/obsdx/` (SQLite database + daemon state + lock file).
- File locking uses `index.lock` with configurable timeout (`--lock-timeout`, default 30s). Stale locks from dead processes are auto-cleaned.
- `--no-cache` bypasses the SQLite cache and scans the vault directly.
- `--refresh` and `--rebuild-cache` force cache operations before the command runs.
- When changing the database schema or cache format, prefer a simple migration when practical. If migration is awkward, it is acceptable to delete the cache and re-index because the cache is rebuildable.

## Development Environment

- Use the Nix flake dev shell.
- Run commands through `nix develop` when the shell is not already active.
- Use `pnpm` for package management.
- Do not add Homebrew dependencies.
- If a system package is needed, add it to `flake.nix`.

## Commands

- Type-check with `pnpm check`.
- Build with `pnpm build`.
- Run tests with `pnpm test`.
- Build the standalone binary with `pnpm --dir packages/cli build:sea`.
- Run the CLI during development with `pnpm dev -- <args>`.
- Lint with `pnpm lint`, format with `pnpm format` (Biome).

## Coding Rules

- Keep stdout clean for command output.
- Send logs, diagnostics, and errors to stderr.
- With `--json`, never mix human text into stdout.
- Do not use interactive Clack prompts when `--json`, `--quiet`, or non-interactive automation is expected.
- Prefer stable JSON shapes over convenient ad hoc output.
- Keep parsers deterministic and covered by fixture tests.
- Store unsupported semantics as explicit errors rather than silently guessing.
- Do not depend on Obsidian internals.

## Git

- Check `git status` before staging or committing.
- Stage only files relevant to the change.
- Do not use `git add .` or `git add -A`.
- Follow existing commit style. If unclear, use Conventional Commits.

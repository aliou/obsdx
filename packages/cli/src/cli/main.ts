#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { boolean, run, string } from "@drizzle-team/brocli";

/**
 * CLI version. At build time, tsdown replaces `CLI_VERSION` with the string from
 * package.json via `define`. In dev mode (tsx), the `declare` is not satisfied
 * by the bundler, so we fall back to reading package.json at runtime.
 */
declare const CLI_VERSION: string;
const version: string =
  typeof CLI_VERSION !== "undefined"
    ? CLI_VERSION
    : JSON.parse(
        readFileSync(
          join(dirname(fileURLToPath(import.meta.url)), "../../package.json"),
          "utf-8",
        ),
      ).version;

import { setIndexLockTimeoutMs } from "../vault/lock";
import { commands } from "./commands";
import { handleCompletion } from "./completion";
import { handleCliError } from "./errors";

export type GlobalOptions = {
  vault?: string;
  json: boolean;
  pretty: boolean;
  ndjson: boolean;
  noCache: boolean;
  refresh: boolean;
  rebuildCache: boolean;
  quiet: boolean;
  verbose: boolean;
  lockTimeout?: string;
};

export const globalOptions = {
  vault: string().desc("Explicit vault root"),
  json: boolean().desc("Emit machine-readable JSON").default(false),
  pretty: boolean()
    .desc("Pretty-print JSON when used with --json")
    .default(false),
  ndjson: boolean()
    .desc("Emit newline-delimited JSON where useful")
    .default(false),
  noCache: boolean("no-cache")
    .desc("Bypass persistent cache and scan directly")
    .default(false),
  refresh: boolean()
    .desc("Force refresh stale cache entries before command")
    .default(false),
  rebuildCache: boolean("rebuild-cache")
    .desc("Rebuild cache before command")
    .default(false),
  quiet: boolean().desc("Suppress non-error human output").default(false),
  verbose: boolean().desc("Emit diagnostic output to stderr").default(false),
  lockTimeout: string("lock-timeout").desc(
    "Milliseconds to wait for cache index lock",
  ),
};

let activeGlobals: GlobalOptions = {
  json: false,
  pretty: false,
  ndjson: false,
  noCache: false,
  refresh: false,
  rebuildCache: false,
  quiet: false,
  verbose: false,
};

export function getGlobalOptions(): GlobalOptions {
  return activeGlobals;
}

async function main(): Promise<void> {
  const argv = normalizeArgv(process.argv);

  if (handleCompletion(argv)) {
    return;
  }

  await run(commands, {
    name: "obsdx",
    description: "Headless Obsidian vault intelligence CLI",
    version: version,
    globals: globalOptions,
    argSource: argv,
    omitKeysOfUndefinedOptions: true,
    hook: (event, _command, globals) => {
      if (event === "before") {
        activeGlobals = globals as GlobalOptions;
        const lockMs = activeGlobals.lockTimeout;
        if (lockMs !== undefined) {
          const parsed = Number(lockMs);
          if (Number.isNaN(parsed) || parsed <= 0) {
            throw new Error(
              `--lock-timeout must be a positive number, got: ${lockMs}`,
            );
          }
          setIndexLockTimeoutMs(parsed);
        }
      }
    },
    theme: (event) => {
      if (event.type === "error" && event.violation === "unknown_error") {
        handleCliError(event.error, activeGlobals);
      }
      return false;
    },
  });
}

function normalizeArgv(argv: string[]): string[] {
  if (argv[2] !== "--") {
    return argv;
  }

  return [argv[0] ?? "node", argv[1] ?? "obsdx", ...argv.slice(3)];
}

main().catch((error: unknown) => {
  handleCliError(error, activeGlobals);
});

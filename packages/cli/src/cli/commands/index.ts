import { type Command, command } from "@drizzle-team/brocli";
import {
  readIndexStatus,
  refreshVaultIndex,
  vacuumVaultCache,
} from "../../vault/indexer";
import { watchVaultIndex } from "../../vault/watcher";
import { resolveVaultFromOptions } from "../context";
import { getGlobalOptions } from "../main";
import { writeHuman, writeJson } from "../output";
import { baseCommand } from "./base";
import { canvasCommand } from "./canvas";
import { daemonCommand } from "./daemon";
import { filesCommand } from "./files";
import { graphCommand } from "./graph";
import { inspectCommand } from "./inspect";
import { linksCommand } from "./links";
import { propertiesCommand } from "./properties";
import { readCommand } from "./read";
import { searchCommand } from "./search";
import { tagsCommand } from "./tags";
import { vaultCommand } from "./vault";

const buildCommand = command({
  name: "build",
  desc: "Create or update the vault cache",
  handler: async () => {
    const options = getGlobalOptions();
    const vault = await resolveVaultFromOptions();
    const result = await refreshVaultIndex(vault);

    if (options.json) {
      writeJson(result, options);
      return;
    }

    writeHuman(`Indexed ${result.indexed} files`, options);
  },
});

const rebuildCommand = command({
  name: "rebuild",
  desc: "Clear and rebuild the vault cache",
  handler: async () => {
    const options = getGlobalOptions();
    const vault = await resolveVaultFromOptions();
    const result = await refreshVaultIndex(vault, { rebuild: true });

    if (options.json) {
      writeJson(result, options);
      return;
    }

    writeHuman(`Rebuilt index with ${result.indexed} files`, options);
  },
});

const refreshCommand = command({
  name: "refresh",
  desc: "Incrementally refresh the vault cache",
  handler: async () => {
    const options = getGlobalOptions();
    const vault = await resolveVaultFromOptions();
    const result = await refreshVaultIndex(vault);

    if (options.json) {
      writeJson(result, options);
      return;
    }

    writeHuman(
      `Refreshed index: ${result.stale} stale, ${result.deleted} deleted`,
      options,
    );
  },
});

const statusCommand = command({
  name: "status",
  desc: "Report cache freshness",
  handler: async () => {
    const options = getGlobalOptions();
    const vault = await resolveVaultFromOptions();
    const status = await readIndexStatus(vault);

    if (options.json) {
      writeJson(status, options);
      return;
    }

    writeHuman(`${status.files} indexed files`, options);
    writeHuman(`${status.staleFiles} stale files`, options);
    writeHuman(`${status.deletedFiles} deleted files`, options);
  },
});

const vacuumCommand = command({
  name: "vacuum",
  desc: "Vacuum the SQLite cache",
  handler: async () => {
    const options = getGlobalOptions();
    const vault = await resolveVaultFromOptions();
    await vacuumVaultCache(vault);

    if (options.json) {
      writeJson({ vacuumed: true }, options);
      return;
    }

    writeHuman("Vacuumed cache", options);
  },
});

const watchCommand = command({
  name: "watch",
  desc: "Watch vault files and refresh the cache",
  handler: async () => {
    const options = getGlobalOptions();
    const vault = await resolveVaultFromOptions();
    const initial = await refreshVaultIndex(vault);

    if (options.json && !options.ndjson) {
      writeJson({ ready: true, initial }, options);
    } else if (options.ndjson) {
      writeJson({ event: "ready", initial }, options);
    } else {
      writeHuman(`Watching ${vault.root}`, options);
    }

    const watcher = watchVaultIndex(vault, {
      onEvent: (event) => {
        if (options.ndjson) {
          writeJson({ event: "file", ...event }, options);
        }
      },
      onRefresh: (refresh) => {
        if (options.json || options.ndjson) {
          writeJson({ event: "refresh", ...refresh }, options);
          return;
        }

        writeHuman(
          `Refreshed index: ${refresh.result.stale} stale, ${refresh.result.deleted} deleted`,
          options,
        );
      },
    });

    await watcher.ready;
    await new Promise<void>((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
    await watcher.close();
  },
});

export const indexCommand = command({
  name: "index",
  desc: "Build and inspect the vault cache",
  subcommands: [
    buildCommand,
    rebuildCommand,
    refreshCommand,
    statusCommand,
    vacuumCommand,
    watchCommand,
  ],
});

export const commands: Command[] = [
  vaultCommand,
  indexCommand,
  daemonCommand,
  filesCommand,
  readCommand,
  inspectCommand,
  linksCommand,
  searchCommand,
  baseCommand,
  graphCommand,
  canvasCommand,
  tagsCommand,
  propertiesCommand,
];

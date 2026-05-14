import path from "node:path";
import { watch } from "chokidar";
import type { ResolvedVault } from "./discover";
import type { IndexRefreshResult } from "./indexer";
import { refreshVaultIndex } from "./indexer";

export type WatchEvent = {
  type: "add" | "change" | "unlink";
  path: string;
};

export type WatchRefresh = {
  events: WatchEvent[];
  result: IndexRefreshResult;
};

export type VaultWatcher = {
  ready: Promise<void>;
  close: () => Promise<void>;
};

export function watchVaultIndex(
  vault: ResolvedVault,
  options: {
    debounceMs?: number;
    onEvent?: (event: WatchEvent) => void;
    onRefresh?: (refresh: WatchRefresh) => void;
  } = {},
): VaultWatcher {
  const debounceMs = options.debounceMs ?? 150;
  const pending = new Map<string, WatchEvent>();
  let timer: NodeJS.Timeout | undefined;
  let refreshQueue = Promise.resolve();
  const watcher = watch(vault.root, {
    ignored: [path.join(vault.cacheDir, "**")],
    ignoreInitial: true,
    persistent: true,
  });
  const ready = new Promise<void>((resolve, reject) => {
    watcher.once("ready", resolve);
    watcher.once("error", reject);
  });

  for (const eventName of ["add", "change", "unlink"] as const) {
    watcher.on(eventName, (filePath) => {
      const event = {
        type: eventName,
        path: path.relative(vault.root, filePath),
      };
      pending.set(event.path, event);
      options.onEvent?.(event);
      scheduleRefresh();
    });
  }

  return {
    ready,
    close: async () => {
      if (timer) {
        clearTimeout(timer);
      }
      await refreshQueue;
      await watcher.close();
    },
  };

  function scheduleRefresh(): void {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      const events = [...pending.values()];
      pending.clear();
      refreshQueue = refreshQueue
        .then(async () => {
          const result = await refreshVaultIndex(vault);
          options.onRefresh?.({ events, result });
        })
        .catch((error: unknown) => {
          // Suppress unhandled rejection; the next refresh will retry.
          // Consumers can observe failures via onRefresh not being called.
          console.error("obsdx watcher refresh failed:", error);
        });
    }, debounceMs);
  }
}

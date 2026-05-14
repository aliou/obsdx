import { type FileHandle, mkdir, open, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { ObsdxError } from "../cli/errors";
import type { ResolvedVault } from "./discover";

const DEFAULT_LOCK_TIMEOUT_MS = 30_000;
const LOCK_POLL_MS = 100;

let configuredLockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS;

export function setIndexLockTimeoutMs(timeoutMs: number | undefined): void {
  configuredLockTimeoutMs =
    timeoutMs === undefined || Number.isNaN(timeoutMs)
      ? DEFAULT_LOCK_TIMEOUT_MS
      : timeoutMs;
}

export async function withIndexLock<T>(
  vault: ResolvedVault,
  callback: () => Promise<T>,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const lockPath = path.join(vault.cacheDir, "index.lock");
  const timeoutMs = options.timeoutMs ?? configuredLockTimeoutMs;
  let lockHandle: FileHandle | undefined;

  await mkdir(vault.cacheDir, { recursive: true });
  lockHandle = await acquireLock(lockPath, timeoutMs);

  try {
    return await callback();
  } finally {
    await lockHandle?.close();
    await rm(lockPath, { force: true });
  }
}

async function acquireLock(
  lockPath: string,
  timeoutMs: number,
): Promise<FileHandle> {
  const startedAt = Date.now();

  while (true) {
    try {
      const lockHandle = await open(lockPath, "wx");
      await lockHandle.writeFile(
        JSON.stringify(
          {
            pid: process.pid,
            createdAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      return lockHandle;
    } catch (error) {
      if (!isFileExistsError(error)) {
        throw error;
      }

      // If the lock is stale (owning process is dead), remove it and retry
      if (await isStaleLock(lockPath)) {
        await rm(lockPath, { force: true });
        continue;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        throw new ObsdxError(
          "CACHE_LOCK_TIMEOUT",
          "Timed out waiting for cache index lock",
          {
            lockPath,
            timeoutMs,
          },
        );
      }

      await sleep(LOCK_POLL_MS);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFileExistsError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

async function isStaleLock(lockPath: string): Promise<boolean> {
  try {
    const content = await readFile(lockPath, "utf-8");
    const data = JSON.parse(content) as { pid?: number };
    if (typeof data.pid !== "number") {
      return true;
    }
    try {
      process.kill(data.pid, 0);
      return false;
    } catch {
      return true;
    }
  } catch {
    // If we can't read or parse the lock file, it may have just been
    // removed by another process. Let the next iteration try again.
    return false;
  }
}

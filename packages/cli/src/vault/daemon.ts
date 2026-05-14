import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type * as Sea from "node:sea";
import { ObsdxError } from "../cli/errors";
import type { ResolvedVault } from "./discover";

export type DaemonState = {
  pid: number;
  startedAt: string;
  vaultRoot: string;
  logPath: string;
};

function daemonStatePath(vault: ResolvedVault): string {
  return path.join(vault.cacheDir, "daemon.json");
}

const require = createRequire(import.meta.url);
const { isSea } = require("node:sea") as typeof Sea;

function daemonLogPath(vault: ResolvedVault): string {
  return path.join(vault.cacheDir, "daemon.log");
}

function daemonArgs(vault: ResolvedVault): string[] {
  if (isSea()) {
    return ["index", "watch", "--vault", vault.root, "--quiet"];
  }

  // When running via tsx in dev, use tsx to launch the source entry.
  // When running as a compiled binary, use node with the dist entry.
  const isDev =
    typeof import.meta.filename === "string" &&
    path.extname(import.meta.filename) === ".ts";
  const filename = import.meta.filename;
  const entryPath = isDev
    ? path.resolve(path.dirname(filename), "../cli/main.ts")
    : path.resolve(path.dirname(filename), "main.js");

  const args = isDev ? ["--import", "tsx/esm", entryPath] : [entryPath];
  args.push("index", "watch", "--vault", vault.root, "--quiet");
  return args;
}

export async function startDaemon(vault: ResolvedVault): Promise<DaemonState> {
  const existing = await readDaemonState(vault);
  if (existing && isProcessAlive(existing.pid)) {
    throw new ObsdxError(
      "DAEMON_ALREADY_RUNNING",
      "Daemon is already running",
      {
        pid: existing.pid,
        startedAt: existing.startedAt,
      },
    );
  }

  // Clean stale state
  if (existing) {
    await rm(daemonStatePath(vault), { force: true });
  }

  const logPath = daemonLogPath(vault);
  const statePath = daemonStatePath(vault);

  // Ensure the cache directory exists before trying to open the log file.
  await mkdir(vault.cacheDir, { recursive: true });

  const args = daemonArgs(vault);

  const logFd = openSync(logPath, "a");
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      OBSDX_DAEMON: "1",
    },
  });

  // Close parent's reference to the log fd; the child keeps it open.
  closeSync(logFd);

  child.unref();

  // Wait briefly for the process to prove it's alive
  await sleep(500);

  if (child.pid === undefined || !isProcessAlive(child.pid)) {
    throw new ObsdxError(
      "DAEMON_START_FAILED",
      "Daemon process exited immediately",
    );
  }

  const state: DaemonState = {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    vaultRoot: vault.root,
    logPath,
  };

  await writeFile(statePath, JSON.stringify(state, null, 2));
  return state;
}

export async function stopDaemon(vault: ResolvedVault): Promise<void> {
  const state = await readDaemonState(vault);
  if (!state) {
    throw new ObsdxError("DAEMON_NOT_RUNNING", "No daemon is running");
  }

  if (!isProcessAlive(state.pid)) {
    // Stale state file, just clean up
    await rm(daemonStatePath(vault), { force: true });
    throw new ObsdxError(
      "DAEMON_NOT_RUNNING",
      "Daemon process is not alive (stale state file removed)",
    );
  }

  try {
    process.kill(state.pid, "SIGTERM");
  } catch (error) {
    // Process may have died between the alive check and the kill.
    void error;
  }

  // Wait for process to exit
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!isProcessAlive(state.pid)) {
      await rm(daemonStatePath(vault), { force: true });
      return;
    }
    await sleep(200);
  }

  // Force kill if still alive
  try {
    process.kill(state.pid, "SIGKILL");
  } catch (error) {
    // Already dead.
    void error;
  }

  await rm(daemonStatePath(vault), { force: true });
}

export async function readDaemonState(
  vault: ResolvedVault,
): Promise<DaemonState | undefined> {
  try {
    const raw = await readFile(daemonStatePath(vault), "utf-8");
    return JSON.parse(raw) as DaemonState;
  } catch {
    return undefined;
  }
}

export async function getDaemonStatus(
  vault: ResolvedVault,
): Promise<{ running: boolean; state?: DaemonState }> {
  const state = await readDaemonState(vault);
  if (!state) {
    return { running: false };
  }

  const alive = isProcessAlive(state.pid);
  if (!alive) {
    // Clean up stale state
    await rm(daemonStatePath(vault), { force: true });
    return { running: false };
  }

  return { running: true, state };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

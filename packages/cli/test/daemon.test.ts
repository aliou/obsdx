import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getDaemonStatus, startDaemon, stopDaemon } from "../src/vault/daemon";
import { discoverVault, type ResolvedVault } from "../src/vault/discover";

async function createTempVault(): Promise<{
  vault: ResolvedVault;
  cleanup: () => Promise<void>;
}> {
  const vaultRoot = await mkdtemp(path.join(tmpdir(), "obsdx-daemon-"));
  await mkdir(path.join(vaultRoot, ".obsidian"), { recursive: true });
  const vault = await discoverVault(vaultRoot);
  return {
    vault,
    cleanup: () => rm(vaultRoot, { recursive: true, force: true }),
  };
}

// Track daemons started in tests so we can clean up
const startedPids: number[] = [];

afterEach(async () => {
  for (const pid of startedPids.splice(0)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      // Already dead.
      void error;
    }
  }
});

describe("daemon", () => {
  it("reports not running when no daemon state exists", async () => {
    const { vault, cleanup } = await createTempVault();
    try {
      const status = await getDaemonStatus(vault);
      expect(status.running).toBe(false);
      expect(status.state).toBeUndefined();
    } finally {
      await cleanup();
    }
  });

  it("starts and reports running", async () => {
    const { vault, cleanup } = await createTempVault();
    try {
      const state = await startDaemon(vault);
      startedPids.push(state.pid);

      expect(state.pid).toBeGreaterThan(0);
      expect(state.vaultRoot).toBe(vault.root);

      const status = await getDaemonStatus(vault);
      expect(status.running).toBe(true);
      expect(status.state?.pid).toBe(state.pid);

      await stopDaemon(vault);

      const afterStop = await getDaemonStatus(vault);
      expect(afterStop.running).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("writes and reads daemon state file", async () => {
    const { vault, cleanup } = await createTempVault();
    try {
      const state = await startDaemon(vault);
      startedPids.push(state.pid);

      const statePath = path.join(vault.cacheDir, "daemon.json");
      const raw = await readFile(statePath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.pid).toBe(state.pid);
      expect(parsed.vaultRoot).toBe(vault.root);

      await stopDaemon(vault);
    } finally {
      await cleanup();
    }
  });

  it("cleans up state file on stop", async () => {
    const { vault, cleanup } = await createTempVault();
    try {
      const state = await startDaemon(vault);
      startedPids.push(state.pid);

      await stopDaemon(vault);

      const statePath = path.join(vault.cacheDir, "daemon.json");
      await expect(readFile(statePath, "utf-8")).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });

  it("throws on double start", async () => {
    const { vault, cleanup } = await createTempVault();
    try {
      const state = await startDaemon(vault);
      startedPids.push(state.pid);

      await expect(startDaemon(vault)).rejects.toMatchObject({
        code: "DAEMON_ALREADY_RUNNING",
      });

      await stopDaemon(vault);
    } finally {
      await cleanup();
    }
  });

  it("throws on stop when not running", async () => {
    const { vault, cleanup } = await createTempVault();
    try {
      await expect(stopDaemon(vault)).rejects.toMatchObject({
        code: "DAEMON_NOT_RUNNING",
      });
    } finally {
      await cleanup();
    }
  });

  it("cleans up stale state and starts fresh", async () => {
    const { vault, cleanup } = await createTempVault();
    try {
      // Write a stale state file pointing to a dead PID
      const statePath = path.join(vault.cacheDir, "daemon.json");
      await mkdir(vault.cacheDir, { recursive: true });
      await writeFile(
        statePath,
        JSON.stringify({
          pid: 999999,
          startedAt: "2026-01-01T00:00:00.000Z",
          vaultRoot: vault.root,
          logPath: path.join(vault.cacheDir, "daemon.log"),
        }),
      );

      // Should clean up stale state and start successfully
      const state = await startDaemon(vault);
      startedPids.push(state.pid);
      expect(state.pid).toBeGreaterThan(0);
      expect(state.pid).not.toBe(999999);

      await stopDaemon(vault);
    } finally {
      await cleanup();
    }
  });

  it("cleans up stale state on status check", async () => {
    const { vault, cleanup } = await createTempVault();
    try {
      const statePath = path.join(vault.cacheDir, "daemon.json");
      await mkdir(vault.cacheDir, { recursive: true });
      await writeFile(
        statePath,
        JSON.stringify({
          pid: 999999,
          startedAt: "2026-01-01T00:00:00.000Z",
          vaultRoot: vault.root,
          logPath: path.join(vault.cacheDir, "daemon.log"),
        }),
      );

      const status = await getDaemonStatus(vault);
      expect(status.running).toBe(false);

      // State file should be removed
      await expect(readFile(statePath, "utf-8")).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });
});

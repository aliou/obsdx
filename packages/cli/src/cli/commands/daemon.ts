import { command } from "@drizzle-team/brocli";
import { getDaemonStatus, startDaemon, stopDaemon } from "../../vault/daemon";
import { resolveVaultFromOptions } from "../context";
import { getGlobalOptions } from "../main";
import { writeHuman, writeJson } from "../output";

const startCommand = command({
  name: "start",
  desc: "Start the index daemon in the background",
  handler: async () => {
    const options = getGlobalOptions();
    const vault = await resolveVaultFromOptions();
    const state = await startDaemon(vault);

    if (options.json) {
      writeJson({ running: true, state }, options);
      return;
    }

    writeHuman(`Daemon started (pid ${state.pid})`, options);
  },
});

const stopCommand = command({
  name: "stop",
  desc: "Stop the index daemon",
  handler: async () => {
    const options = getGlobalOptions();
    const vault = await resolveVaultFromOptions();
    await stopDaemon(vault);

    if (options.json) {
      writeJson({ running: false }, options);
      return;
    }

    writeHuman("Daemon stopped", options);
  },
});

const statusCommand = command({
  name: "status",
  desc: "Check if the index daemon is running",
  handler: async () => {
    const options = getGlobalOptions();
    const vault = await resolveVaultFromOptions();
    const status = await getDaemonStatus(vault);

    if (options.json) {
      writeJson(status, options);
      return;
    }

    if (status.running) {
      writeHuman(
        `Daemon running (pid ${status.state?.pid}, since ${status.state?.startedAt})`,
        options,
      );
    } else {
      writeHuman("Daemon not running", options);
    }
  },
});

export const daemonCommand = command({
  name: "daemon",
  desc: "Manage the background index daemon",
  subcommands: [startCommand, stopCommand, statusCommand],
});

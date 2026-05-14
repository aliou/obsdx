import { command } from "@drizzle-team/brocli";
import { loadVaultConfig } from "../../vault/config";
import { discoverVault } from "../../vault/discover";
import { getGlobalOptions } from "../main";
import { writeHuman, writeJson } from "../output";

export const vaultCommand = command({
  name: "vault",
  desc: "Inspect vault metadata",
  subcommands: [
    command({
      name: "info",
      desc: "Print resolved vault information",
      handler: async () => {
        const options = getGlobalOptions();
        const resolved = await discoverVault(options.vault);
        const config = await loadVaultConfig(resolved);
        const output = {
          root: resolved.root,
          obsidianDir: resolved.obsidianDir,
          cacheDir: resolved.cacheDir,
          config,
        };

        if (options.json) {
          writeJson(output, options);
          return;
        }

        writeHuman(`Vault: ${resolved.root}`, options);
        writeHuman(`Cache: ${resolved.cacheDir}`, options);
      },
    }),
  ],
});

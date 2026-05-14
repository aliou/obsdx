import { command, positional, string } from "@drizzle-team/brocli";
import {
  getIndexedFile,
  listChangedFiles,
  listIndexedFiles,
} from "../../vault/indexer";
import { scanVaultFiles } from "../../vault/scanner";
import { resolveVaultFromOptions } from "../context";
import { ObsdxError } from "../errors";
import { getGlobalOptions } from "../main";
import { writeHuman, writeJson } from "../output";

export const filesCommand = command({
  name: "files",
  desc: "Inspect vault files",
  subcommands: [
    command({
      name: "list",
      desc: "List vault files",
      options: {
        folder: string().desc("Filter by folder"),
        ext: string().desc("Filter by extension"),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const files = options.noCache
          ? await scanVaultFiles(vault.root)
          : await listIndexedFiles(vault, {
              folder: commandOptions.folder,
              ext: commandOptions.ext,
            });
        const filteredFiles = options.noCache
          ? files.filter((file) => {
              const folderMatches =
                commandOptions.folder === undefined ||
                file.folder === commandOptions.folder;
              const extMatches =
                commandOptions.ext === undefined ||
                file.ext === normalizeExt(commandOptions.ext);
              return folderMatches && extMatches;
            })
          : files;

        if (options.json) {
          writeJson({ files: filteredFiles }, options);
          return;
        }

        for (const file of filteredFiles) {
          writeHuman(file.path, options);
        }
      },
    }),
    command({
      name: "stat",
      desc: "Inspect one vault file",
      options: {
        path: positional("path").desc("Vault-relative path").required(),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const file = await getIndexedFile(vault, commandOptions.path);

        if (!file) {
          throw new ObsdxError(
            "FILE_NOT_FOUND",
            `File not found: ${commandOptions.path}`,
            {
              path: commandOptions.path,
            },
          );
        }

        if (options.json) {
          writeJson({ file }, options);
          return;
        }

        writeHuman(`${file.path} (${file.kind}, ${file.size} bytes)`, options);
      },
    }),
    command({
      name: "changed",
      desc: "List files changed since the last index",
      handler: async () => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const changed = await listChangedFiles(vault);

        if (options.json) {
          writeJson(changed, options);
          return;
        }

        for (const file of changed.stale) {
          writeHuman(`stale ${file.path}`, options);
        }

        for (const file of changed.deleted) {
          writeHuman(`deleted ${file.path}`, options);
        }
      },
    }),
  ],
});

function normalizeExt(ext: string): string {
  return ext.startsWith(".") ? ext.slice(1).toLowerCase() : ext.toLowerCase();
}

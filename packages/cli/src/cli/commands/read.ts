import { readFile } from "node:fs/promises";
import path from "node:path";
import { command, positional } from "@drizzle-team/brocli";
import { getIndexedFile } from "../../vault/indexer";
import { resolveVaultFromOptions } from "../context";
import { ObsdxError } from "../errors";
import { getGlobalOptions } from "../main";
import { writeJson } from "../output";

export const readCommand = command({
  name: "read",
  desc: "Read a vault file",
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

    const content = await readFile(path.join(vault.root, file.path), "utf8");

    if (options.json) {
      writeJson({ file, content }, options);
      return;
    }

    process.stdout.write(content);
  },
});

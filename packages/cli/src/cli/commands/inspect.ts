import { command, positional } from "@drizzle-team/brocli";
import { inspectIndexedFile } from "../../vault/indexer";
import { resolveVaultFromOptions } from "../context";
import { ObsdxError } from "../errors";
import { getGlobalOptions } from "../main";
import { writeHuman, writeJson } from "../output";

export const inspectCommand = command({
  name: "inspect",
  desc: "Inspect indexed metadata for a vault file",
  options: {
    path: positional("path").desc("Vault-relative path").required(),
  },
  handler: async (commandOptions) => {
    const options = getGlobalOptions();
    const vault = await resolveVaultFromOptions();
    const inspection = await inspectIndexedFile(vault, commandOptions.path);

    if (!inspection) {
      throw new ObsdxError(
        "FILE_NOT_FOUND",
        `File not found: ${commandOptions.path}`,
        {
          path: commandOptions.path,
        },
      );
    }

    if (options.json) {
      writeJson(inspection, options);
      return;
    }

    writeHuman(inspection.file.path, options);
    writeHuman(`${inspection.properties.length} properties`, options);
    writeHuman(`${inspection.tags.length} tags`, options);
    writeHuman(`${inspection.links.length} outgoing links`, options);
    writeHuman(`${inspection.headings.length} headings`, options);
  },
});

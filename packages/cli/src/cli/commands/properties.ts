import { command, positional, string } from "@drizzle-team/brocli";
import {
  getIndexedProperties,
  listIndexedFilesForProperty,
  listIndexedPropertyCounts,
} from "../../vault/indexer";
import { resolveVaultFromOptions } from "../context";
import { ObsdxError } from "../errors";
import { getGlobalOptions } from "../main";
import { writeHuman, writeJson } from "../output";

export const propertiesCommand = command({
  name: "properties",
  desc: "Inspect vault properties",
  subcommands: [
    command({
      name: "list",
      desc: "List indexed properties",
      handler: async () => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const properties = await listIndexedPropertyCounts(vault);

        if (options.json) {
          writeJson({ properties }, options);
          return;
        }

        for (const property of properties) {
          writeHuman(`${property.name} ${property.count}`, options);
        }
      },
    }),
    command({
      name: "get",
      desc: "Get properties for a vault file",
      options: {
        path: positional("path").desc("Vault-relative path").required(),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const properties = await getIndexedProperties(
          vault,
          commandOptions.path,
        );

        if (!properties) {
          throw new ObsdxError(
            "FILE_NOT_FOUND",
            `File not found: ${commandOptions.path}`,
            {
              path: commandOptions.path,
            },
          );
        }

        if (options.json) {
          writeJson({ file: commandOptions.path, properties }, options);
          return;
        }

        for (const property of properties) {
          writeHuman(`${property.name}: ${String(property.value)}`, options);
        }
      },
    }),
    command({
      name: "files",
      desc: "List files matching a property",
      options: {
        name: string().desc("Property name").required(),
        value: string().desc("Property value (optional)"),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const files = await listIndexedFilesForProperty(
          vault,
          commandOptions.name,
          commandOptions.value ?? undefined,
        );

        if (options.json) {
          writeJson(
            {
              property: commandOptions.name,
              value: commandOptions.value ?? null,
              files,
            },
            options,
          );
          return;
        }

        for (const file of files) {
          writeHuman(file.path, options);
        }
      },
    }),
  ],
});

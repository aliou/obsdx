import { command, positional, string } from "@drizzle-team/brocli";
import {
  listIndexedAmbiguousLinks,
  listIndexedBacklinks,
  listIndexedMentions,
  listIndexedOutgoingLinks,
  listIndexedUnresolvedLinks,
} from "../../vault/indexer";
import { resolveVaultFromOptions } from "../context";
import { ObsdxError } from "../errors";
import { getGlobalOptions } from "../main";
import { writeHuman, writeJson } from "../output";

export const linksCommand = command({
  name: "links",
  desc: "Inspect vault links",
  subcommands: [
    command({
      name: "outgoing",
      desc: "List outgoing links from a vault file",
      options: {
        path: positional("path").desc("Vault-relative path").required(),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const links = await listIndexedOutgoingLinks(
          vault,
          commandOptions.path,
        );

        if (!links) {
          throw new ObsdxError(
            "FILE_NOT_FOUND",
            `File not found: ${commandOptions.path}`,
            {
              path: commandOptions.path,
            },
          );
        }

        if (options.json) {
          writeJson({ file: commandOptions.path, links }, options);
          return;
        }

        for (const link of links) {
          writeHuman(link.raw, options);
        }
      },
    }),
    command({
      name: "backlinks",
      desc: "List backlinks for a vault file",
      options: {
        path: positional("path").desc("Vault-relative path").required(),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const links = await listIndexedBacklinks(vault, commandOptions.path);

        if (!links) {
          throw new ObsdxError(
            "FILE_NOT_FOUND",
            `File not found: ${commandOptions.path}`,
            {
              path: commandOptions.path,
            },
          );
        }

        if (options.json) {
          writeJson({ file: commandOptions.path, links }, options);
          return;
        }

        for (const link of links) {
          writeHuman(`${link.sourcePath ?? ""}: ${link.raw}`, options);
        }
      },
    }),
    command({
      name: "resolve",
      desc: "Resolve a link as it appears in a source file",
      options: {
        input: positional("input").desc("Raw link text").required(),
        from: string().desc("Source file path").required(),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const links = await listIndexedOutgoingLinks(
          vault,
          commandOptions.from,
        );

        if (!links) {
          throw new ObsdxError(
            "FILE_NOT_FOUND",
            `File not found: ${commandOptions.from}`,
            {
              path: commandOptions.from,
            },
          );
        }

        const link = links.find(
          (candidate) => candidate.raw === commandOptions.input,
        );
        const output = {
          input: commandOptions.input,
          from: commandOptions.from,
          resolved: Boolean(link?.resolvedPath),
          target: link
            ? {
                path: link.resolvedPath,
                heading: link.heading,
                blockId: link.blockId,
                ambiguousPaths: link.ambiguousPaths,
                unresolved: link.unresolved,
              }
            : null,
        };

        if (options.json) {
          writeJson(output, options);
          return;
        }

        writeHuman(link?.resolvedPath ?? "unresolved", options);
      },
    }),
    command({
      name: "unresolved",
      desc: "List unresolved links",
      handler: async () => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const links = await listIndexedUnresolvedLinks(vault);

        if (options.json) {
          writeJson({ links }, options);
          return;
        }

        for (const link of links) {
          writeHuman(`${link.sourcePath ?? ""}: ${link.raw}`, options);
        }
      },
    }),
    command({
      name: "ambiguous",
      desc: "List ambiguous links",
      handler: async () => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const links = await listIndexedAmbiguousLinks(vault);

        if (options.json) {
          writeJson({ links }, options);
          return;
        }

        for (const link of links) {
          writeHuman(`${link.sourcePath ?? ""}: ${link.raw}`, options);
        }
      },
    }),
    command({
      name: "mentions",
      desc: "Find files that mention a path or text",
      options: {
        query: positional("query")
          .desc("Path or text to search for")
          .required(),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const links = await listIndexedMentions(vault, commandOptions.query);

        if (options.json) {
          writeJson({ query: commandOptions.query, links }, options);
          return;
        }

        for (const link of links) {
          writeHuman(
            `${link.sourcePath ?? ""}: ${link.raw} -> ${link.resolvedPath ?? link.targetText}`,
            options,
          );
        }
      },
    }),
  ],
});

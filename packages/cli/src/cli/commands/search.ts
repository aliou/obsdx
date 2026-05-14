import { command, positional, string } from "@drizzle-team/brocli";
import { searchIndexedMarkdown } from "../../vault/indexer";
import { resolveVaultFromOptions } from "../context";
import { ObsdxError } from "../errors";
import { getGlobalOptions } from "../main";
import { writeHuman, writeJson } from "../output";

export const searchCommand = command({
  name: "search",
  desc: "Search indexed markdown files",
  options: {
    query: positional("query").desc("Text query"),
    regex: string().desc("Regular expression query"),
    folder: string().desc("Filter by folder"),
    ext: string().desc("Filter by extension"),
    tag: string().desc("Filter by tag"),
    property: string().desc("Filter by property name or name=value"),
    path: string().desc("Filter by path substring"),
    linkedTo: string("linked-to").desc("Filter to files linking to a path"),
    linksFrom: string("links-from").desc("Filter to one source file path"),
    limit: string().desc("Maximum result count"),
  },
  handler: async (commandOptions) => {
    const options = getGlobalOptions();
    if (!commandOptions.query && !commandOptions.regex) {
      throw new ObsdxError(
        "SEARCH_QUERY_REQUIRED",
        "Search requires a query or --regex",
      );
    }

    const vault = await resolveVaultFromOptions();
    let limit: number | undefined;
    if (commandOptions.limit) {
      limit = Number(commandOptions.limit);
      if (Number.isNaN(limit) || limit <= 0) {
        throw new ObsdxError(
          "INVALID_OPTION",
          `--limit must be a positive number, got: ${commandOptions.limit}`,
        );
      }
    }

    const results = await searchIndexedMarkdown(vault, {
      query: commandOptions.query,
      regex: commandOptions.regex,
      folder: commandOptions.folder,
      ext: commandOptions.ext,
      tag: commandOptions.tag,
      property: commandOptions.property,
      path: commandOptions.path,
      linkedTo: commandOptions.linkedTo,
      linksFrom: commandOptions.linksFrom,
      limit,
    });

    if (options.json) {
      writeJson({ results }, options);
      return;
    }

    for (const result of results) {
      const firstMatch = result.matches[0];
      const location = firstMatch?.line
        ? `${result.file.path}:${firstMatch.line}`
        : result.file.path;
      writeHuman(
        firstMatch ? `${location}: ${firstMatch.text}` : location,
        options,
      );
    }
  },
});

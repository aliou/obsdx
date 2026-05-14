import { boolean, command, positional } from "@drizzle-team/brocli";
import type { TagTreeNode } from "../../vault/cache";
import {
  listIndexedFilesForTag,
  listIndexedTagCounts,
  listIndexedTagTree,
} from "../../vault/indexer";
import { resolveVaultFromOptions } from "../context";
import { getGlobalOptions } from "../main";
import { writeHuman, writeJson } from "../output";

export const tagsCommand = command({
  name: "tags",
  desc: "Inspect vault tags",
  subcommands: [
    command({
      name: "list",
      desc: "List indexed tags",
      options: {
        counts: boolean().desc("Include file counts").default(false),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const tags = await listIndexedTagCounts(vault);

        if (options.json) {
          writeJson({ tags }, options);
          return;
        }

        for (const tag of tags) {
          writeHuman(
            commandOptions.counts ? `${tag.tag} ${tag.count}` : tag.tag,
            options,
          );
        }
      },
    }),
    command({
      name: "files",
      desc: "List files with a tag",
      options: {
        tag: positional("tag").desc("Tag name").required(),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const files = await listIndexedFilesForTag(vault, commandOptions.tag);

        if (options.json) {
          writeJson({ tag: commandOptions.tag, files }, options);
          return;
        }

        for (const file of files) {
          writeHuman(file.file.path, options);
        }
      },
    }),
    command({
      name: "tree",
      desc: "List tags as a nested tree",
      handler: async () => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const tree = await listIndexedTagTree(vault);

        if (options.json) {
          writeJson({ tags: tree }, options);
          return;
        }

        printTagTree(tree, 0, options);
      },
    }),
  ],
});

function printTagTree(
  nodes: TagTreeNode[],
  depth: number,
  options: { quiet: boolean },
): void {
  for (const node of nodes) {
    const indent = "  ".repeat(depth);
    writeHuman(`${indent}${node.fullTag} (${node.count})`, options);
    printTagTree(node.children, depth + 1, options);
  }
}

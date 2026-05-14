import { command, positional, string } from "@drizzle-team/brocli";
import {
  type GraphDirection,
  graphComponents,
  graphNeighborhood,
  graphOrphans,
  shortestGraphPath,
} from "../../graph/graph";
import {
  exportIndexedGraph,
  listIndexedUnresolvedLinks,
} from "../../vault/indexer";
import { resolveVaultFromOptions } from "../context";
import { getGlobalOptions } from "../main";
import { writeHuman, writeJson } from "../output";

export const graphCommand = command({
  name: "graph",
  desc: "Inspect the resolved vault graph",
  subcommands: [
    command({
      name: "export",
      desc: "Export graph nodes and edges",
      handler: async () => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const graph = await exportIndexedGraph(vault);

        if (options.json) {
          writeJson(graph, options);
          return;
        }

        writeHuman(
          `${graph.nodes.length} nodes, ${graph.edges.length} edges`,
          options,
        );
      },
    }),
    command({
      name: "neighborhood",
      desc: "Export a graph neighborhood",
      options: {
        path: positional("path").desc("Vault-relative file path").required(),
        depth: string().desc("Traversal depth"),
        direction: string().desc("incoming, outgoing, or both"),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const graph = graphNeighborhood(
          await exportIndexedGraph(vault),
          commandOptions.path,
          {
            depth: commandOptions.depth ? Number(commandOptions.depth) : 1,
            direction: parseDirection(commandOptions.direction),
          },
        );

        if (options.json) {
          writeJson(graph, options);
          return;
        }

        for (const node of graph.nodes) {
          writeHuman(node.path, options);
        }
      },
    }),
    command({
      name: "shortest-path",
      desc: "Find the shortest directed graph path",
      options: {
        from: positional("from").desc("Start path").required(),
        to: positional("to").desc("End path").required(),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const path = shortestGraphPath(
          await exportIndexedGraph(vault),
          commandOptions.from,
          commandOptions.to,
        );

        if (options.json) {
          writeJson({ path }, options);
          return;
        }

        writeHuman(path?.join(" -> ") ?? "not found", options);
      },
    }),
    command({
      name: "components",
      desc: "List connected graph components",
      handler: async () => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const graph = await exportIndexedGraph(vault);
        const components = graphComponents(graph);

        if (options.json) {
          writeJson({ components }, options);
          return;
        }

        for (const component of components) {
          writeHuman(component.map((node) => node.path).join(", "), options);
        }
      },
    }),
    command({
      name: "orphans",
      desc: "List files with no resolved graph edges",
      handler: async () => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const graph = await exportIndexedGraph(vault);
        const orphans = graphOrphans(graph);

        if (options.json) {
          writeJson({ orphans }, options);
          return;
        }

        for (const node of orphans) {
          writeHuman(node.path, options);
        }
      },
    }),
    command({
      name: "unresolved",
      desc: "List unresolved graph links",
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
  ],
});

function parseDirection(direction: string | undefined): GraphDirection {
  if (
    direction === "incoming" ||
    direction === "outgoing" ||
    direction === "both"
  ) {
    return direction;
  }

  return "both";
}

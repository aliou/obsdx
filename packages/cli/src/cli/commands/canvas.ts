import { command, positional } from "@drizzle-team/brocli";
import {
  exportIndexedCanvasGraph,
  inspectIndexedCanvas,
  listIndexedCanvases,
} from "../../vault/indexer";
import { resolveVaultFromOptions } from "../context";
import { ObsdxError } from "../errors";
import { getGlobalOptions } from "../main";
import { writeHuman, writeJson } from "../output";

export const canvasCommand = command({
  name: "canvas",
  desc: "Inspect Obsidian Canvas files",
  subcommands: [
    command({
      name: "list",
      desc: "List canvas files",
      handler: async () => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const canvases = await listIndexedCanvases(vault);

        if (options.json) {
          writeJson({ canvases }, options);
          return;
        }

        for (const canvas of canvases) {
          writeHuman(canvas.path, options);
        }
      },
    }),
    command({
      name: "inspect",
      desc: "Inspect a canvas file",
      options: {
        path: positional("path").desc("Vault-relative canvas path").required(),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const canvas = await inspectIndexedCanvas(vault, commandOptions.path);

        if (!canvas) {
          throw canvasNotFound(commandOptions.path);
        }

        if (options.json) {
          writeJson({ canvas }, options);
          return;
        }

        writeHuman(
          `${canvas.nodes.length} nodes, ${canvas.edges.length} edges`,
          options,
        );
      },
    }),
    command({
      name: "graph",
      desc: "Extract graph edges from a canvas file",
      options: {
        path: positional("path").desc("Vault-relative canvas path").required(),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const graph = await exportIndexedCanvasGraph(
          vault,
          commandOptions.path,
        );

        if (!graph) {
          throw canvasNotFound(commandOptions.path);
        }

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
  ],
});

function canvasNotFound(path: string): ObsdxError {
  return new ObsdxError("CANVAS_NOT_FOUND", `Canvas not found: ${path}`, {
    path,
  });
}

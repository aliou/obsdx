import path from "node:path";
import type { GraphEdge, VaultGraph } from "@aliou/obsdx-index";
import type { CanvasDocument, CanvasNode } from "./parser";

export function canvasGraph(
  canvasPath: string,
  canvas: CanvasDocument,
): VaultGraph {
  const fileEntries = canvas.nodes
    .filter((node): node is CanvasNode & { file: string } => Boolean(node.file))
    .map((node) => {
      const normalized = normalizeCanvasFile(node.file);
      return [
        node.id,
        { path: normalized.path, kind: normalized.kind },
      ] as const;
    });

  const fileNodes = new Map(fileEntries);

  const uniqueFiles = new Map<string, { kind: string }>(
    [...fileNodes.values()].map((f) => [f.path, { kind: f.kind }]),
  );

  const nodes = [
    { path: canvasPath, kind: "canvas" },
    ...[...uniqueFiles.entries()].map(([path, { kind }]) => ({ path, kind })),
  ];
  const edges: GraphEdge[] = [
    ...[...fileNodes.values()].map((f) => ({
      source: canvasPath,
      target: f.path,
      kind: "canvas-file" as const,
    })),
    ...canvas.edges.flatMap((edge) => {
      const source = fileNodes.get(edge.fromNode);
      const target = fileNodes.get(edge.toNode);
      return source && target
        ? [
            {
              source: source.path,
              target: target.path,
              kind: "canvas-edge" as const,
            },
          ]
        : [];
    }),
  ];

  return { nodes, edges };
}

function normalizeCanvasFile(file: string): { path: string; kind: string } {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".md") {
    return { path: file, kind: "markdown" };
  }
  if (ext === "") {
    return { path: `${file}.md`, kind: "markdown" };
  }
  const kindMap: Record<string, string> = {
    ".canvas": "canvas",
    ".base": "base",
    ".png": "attachment",
    ".jpg": "attachment",
    ".jpeg": "attachment",
    ".gif": "attachment",
    ".webp": "attachment",
    ".svg": "attachment",
    ".pdf": "attachment",
  };
  return { path: file, kind: kindMap[ext] ?? "attachment" };
}

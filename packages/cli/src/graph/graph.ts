export type GraphEdgeKind =
  | "link"
  | "embed"
  | "property-link"
  | "canvas-file"
  | "canvas-edge"
  | "base-embed";

export type GraphEdge = {
  source: string;
  target: string;
  kind: GraphEdgeKind;
};

export type GraphNode = {
  path: string;
  kind: string;
};

export type VaultGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type GraphDirection = "incoming" | "outgoing" | "both";

export function graphNeighborhood(
  graph: VaultGraph,
  start: string,
  options: { depth?: number; direction?: GraphDirection } = {},
): VaultGraph {
  const depth = options.depth ?? 1;
  const direction = options.direction ?? "both";
  const visited = new Set([start]);
  let frontier = new Set([start]);

  for (let level = 0; level < depth; level += 1) {
    const next = new Set<string>();
    for (const edge of graph.edges) {
      for (const path of frontier) {
        if (traverses(edge, path, direction)) {
          next.add(edge.source === path ? edge.target : edge.source);
        }
      }
    }

    for (const path of next) {
      visited.add(path);
    }
    frontier = next;
  }

  return subgraph(graph, visited);
}

export function graphOrphans(graph: VaultGraph): GraphNode[] {
  const connected = new Set<string>();
  for (const edge of graph.edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }

  return graph.nodes.filter((node) => !connected.has(node.path));
}

export function graphComponents(graph: VaultGraph): GraphNode[][] {
  const remaining = new Set(graph.nodes.map((node) => node.path));
  const nodesByPath = new Map(graph.nodes.map((node) => [node.path, node]));
  const components: GraphNode[][] = [];

  while (remaining.size > 0) {
    const start = remaining.values().next().value as string;
    const neighborhood = graphNeighborhood(graph, start, {
      depth: graph.nodes.length,
      direction: "both",
    });
    const component = neighborhood.nodes;
    for (const node of component) {
      remaining.delete(node.path);
    }
    components.push(
      component.flatMap((node) => nodesByPath.get(node.path) ?? []),
    );
  }

  return components;
}

export function shortestGraphPath(
  graph: VaultGraph,
  start: string,
  end: string,
): string[] | null {
  const queue: string[][] = [[start]];
  const visited = new Set([start]);

  while (queue.length > 0) {
    const path = queue.shift() ?? [];
    const current = path.at(-1);
    if (!current) {
      continue;
    }
    if (current === end) {
      return path;
    }

    for (const edge of graph.edges) {
      if (edge.source !== current || visited.has(edge.target)) {
        continue;
      }
      visited.add(edge.target);
      queue.push([...path, edge.target]);
    }
  }

  return null;
}

function subgraph(graph: VaultGraph, paths: Set<string>): VaultGraph {
  return {
    nodes: graph.nodes.filter((node) => paths.has(node.path)),
    edges: graph.edges.filter(
      (edge) => paths.has(edge.source) && paths.has(edge.target),
    ),
  };
}

function traverses(
  edge: GraphEdge,
  path: string,
  direction: GraphDirection,
): boolean {
  return (
    (direction !== "incoming" && edge.source === path) ||
    (direction !== "outgoing" && edge.target === path)
  );
}

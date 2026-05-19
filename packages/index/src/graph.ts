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

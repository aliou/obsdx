export type CanvasNode = {
  id: string;
  type: string;
  file?: string;
  text?: string;
  url?: string;
  label?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type CanvasEdge = {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: string;
  toSide?: string;
  label?: string;
};

export type CanvasDocument = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

export function parseCanvas(source: string): CanvasDocument {
  const parsed = JSON.parse(source) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Canvas file must contain a JSON object");
  }

  return {
    nodes: Array.isArray(parsed.nodes) ? parsed.nodes.flatMap(parseNode) : [],
    edges: Array.isArray(parsed.edges) ? parsed.edges.flatMap(parseEdge) : [],
  };
}

function parseNode(value: unknown): CanvasNode[] {
  if (!isRecord(value) || typeof value.id !== "string") {
    return [];
  }

  return [
    {
      id: value.id,
      type: typeof value.type === "string" ? value.type : "unknown",
      file: stringValue(value.file),
      text: stringValue(value.text),
      url: stringValue(value.url),
      label: stringValue(value.label),
      x: numberValue(value.x),
      y: numberValue(value.y),
      width: numberValue(value.width),
      height: numberValue(value.height),
    },
  ];
}

function parseEdge(value: unknown): CanvasEdge[] {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.fromNode !== "string" ||
    typeof value.toNode !== "string"
  ) {
    return [];
  }

  return [
    {
      id: value.id,
      fromNode: value.fromNode,
      toNode: value.toNode,
      fromSide: stringValue(value.fromSide),
      toSide: stringValue(value.toSide),
      label: stringValue(value.label),
    },
  ];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

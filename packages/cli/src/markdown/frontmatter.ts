import YAML from "yaml";

export type FrontmatterResult = {
  value: Record<string, unknown> | null;
  body: string;
  bodyStartLine: number;
  error?: string;
};

export function parseFrontmatter(source: string): FrontmatterResult {
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) {
    return {
      value: null,
      body: source,
      bodyStartLine: 1,
    };
  }

  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match) {
    return {
      value: null,
      body: source,
      bodyStartLine: 1,
      error: "Unclosed frontmatter block",
    };
  }

  const raw = match[1] ?? "";
  const body = source.slice(match[0].length);
  const bodyStartLine = countLines(match[0]) + 1;

  try {
    const parsed = YAML.parse(raw, { mapAsMap: true });
    const normalized = normalizeYamlValue(parsed);
    return {
      value: isRecord(normalized) ? normalized : null,
      body,
      bodyStartLine,
    };
  } catch (error) {
    return {
      value: null,
      body,
      bodyStartLine,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function countLines(source: string): number {
  return source.split(/\r?\n/).length - 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeYamlValue(value: unknown): unknown {
  if (value instanceof Map) {
    const record: Record<string, unknown> = {};

    for (const [key, item] of value.entries()) {
      record[String(normalizeYamlValue(key))] = normalizeYamlValue(item);
    }

    return record;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeYamlValue(item));
  }

  return value;
}

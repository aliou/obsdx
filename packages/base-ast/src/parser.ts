import YAML from "yaml";

export type BasePropertyConfig = {
  displayName?: string;
};

export type BaseSort = {
  property: string;
  direction?: "ASC" | "DESC";
};

export type BaseGroupBy = {
  property: string;
  direction?: "ASC" | "DESC";
};

export type BaseView = {
  type: string;
  name: string;
  filters?: unknown;
  order?: string[];
  sort?: BaseSort[];
  limit?: number;
  groupBy?: BaseGroupBy;
  summaries?: Record<string, unknown>;
  raw: Record<string, unknown>;
};

export type BaseDefinition = {
  path: string;
  source: Record<string, unknown>;
  properties: Record<string, BasePropertyConfig>;
  formulas: Record<string, string>;
  filters?: unknown;
  summaries?: Record<string, string>;
  views: BaseView[];
};

export function parseBase(path: string, source: string): BaseDefinition {
  const parsed = YAML.parse(source) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Base file must contain a YAML object");
  }

  return {
    path,
    source: parsed,
    properties: parseProperties(parsed.properties),
    formulas: parseFormulas(parsed.formulas),
    filters: parsed.filters,
    summaries: parseSummaries(parsed.summaries),
    views: parseViews(parsed.views),
  };
}

export function validateBase(base: BaseDefinition): string[] {
  const errors: string[] = [];

  if (!Array.isArray(base.source.views)) {
    errors.push("views must be a list");
  }

  for (const [index, view] of base.views.entries()) {
    if (!view.name) {
      errors.push(`views[${index}].name is required`);
    }
    if (!view.type) {
      errors.push(`views[${index}].type is required`);
    }
  }

  return errors;
}

function parseProperties(value: unknown): Record<string, BasePropertyConfig> {
  if (!isRecord(value)) {
    return {};
  }

  const properties: Record<string, BasePropertyConfig> = {};
  for (const [name, config] of Object.entries(value)) {
    properties[name] = isRecord(config)
      ? { displayName: stringValue(config.displayName) }
      : {};
  }

  return properties;
}

function parseFormulas(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  const formulas: Record<string, string> = {};
  for (const [name, formula] of Object.entries(value)) {
    formulas[name] = String(formula);
  }

  return formulas;
}

function parseSummaries(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const summaries: Record<string, string> = {};
  for (const [name, formula] of Object.entries(value)) {
    summaries[name] = String(formula);
  }

  return summaries;
}

function parseViews(value: unknown): BaseView[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((view) => ({
    type: stringValue(view.type) ?? "table",
    name: stringValue(view.name) ?? "",
    filters: view.filters,
    order: Array.isArray(view.order) ? view.order.map(String) : undefined,
    sort: parseSort(view.sort),
    limit: typeof view.limit === "number" ? view.limit : undefined,
    groupBy: parseGroupBy(view.groupBy),
    summaries: isRecord(view.summaries) ? view.summaries : undefined,
    raw: view,
  }));
}

function parseGroupBy(value: unknown): BaseGroupBy | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const property = stringValue(value.property);
  if (!property) {
    return undefined;
  }

  return {
    property,
    direction: value.direction === "DESC" ? "DESC" : "ASC",
  };
}

function parseSort(value: unknown): BaseSort[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const sort = value.filter(isRecord).flatMap((item) => {
    const property = stringValue(item.property);
    if (!property) {
      return [];
    }

    return [
      {
        property,
        direction: item.direction === "DESC" ? "DESC" : "ASC",
      } satisfies BaseSort,
    ];
  });

  return sort.length > 0 ? sort : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import YAML from "yaml";
import type { Expr } from "./expressions/ast";
import { parseExpression } from "./expressions/parser";

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
  requiresContext: boolean;
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

  const base: BaseDefinition = {
    path,
    source: parsed,
    properties: parseProperties(parsed.properties),
    formulas: parseFormulas(parsed.formulas),
    filters: parsed.filters,
    summaries: parseSummaries(parsed.summaries),
    views: parseViews(parsed.views),
  };

  return resolveContextRequirements(base);
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
    requiresContext: false,
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

// ---------------------------------------------------------------------------
// `this` reference detection
// ---------------------------------------------------------------------------

/**
 * Walk a parsed expression AST and check whether any identifier node
 * references the `this` keyword.
 *
 * Uses the real parser so we avoid false positives from string literals
 * or regex literals that happen to contain the word "this".
 */
export function expressionUsesThis(source: string): boolean {
  try {
    return astUsesThis(parseExpression(source));
  } catch {
    // If the expression fails to parse, conservatively assume no `this` usage.
    // A parse error will surface elsewhere (e.g. base validate / query).
    return false;
  }
}

function astUsesThis(expr: Expr): boolean {
  switch (expr.kind) {
    case "literal":
    case "regex":
      return false;
    case "array":
      return expr.elements.some(astUsesThis);
    case "identifier":
      return expr.name === "this";
    case "member":
      return astUsesThis(expr.object);
    case "index":
      return astUsesThis(expr.object) || astUsesThis(expr.index);
    case "call":
      return astUsesThis(expr.callee) || expr.args.some(astUsesThis);
    case "unary":
      return astUsesThis(expr.right);
    case "binary":
      return astUsesThis(expr.left) || astUsesThis(expr.right);
  }
}

/**
 * Recursively check whether a filter structure references `this`.
 *
 * Filters can be:
 * - A string expression (e.g. `"file.inFolder(\"raw\")"`)
 * - An array of filters (implicit AND)
 * - An object with `and`, `or`, or `not` keys containing sub-filters
 */
export function filterUsesThis(filters: unknown): boolean {
  if (typeof filters === "string") {
    return expressionUsesThis(filters);
  }

  if (Array.isArray(filters)) {
    return filters.some(filterUsesThis);
  }

  if (isRecord(filters)) {
    return (
      filterUsesThis(filters.and) ||
      filterUsesThis(filters.or) ||
      filterUsesThis(filters.not)
    );
  }

  return false;
}

/**
 * Determine which formulas in a base definition reference `this`.
 *
 * A formula uses `this` if its parsed expression AST contains an identifier
 * node with name "this".
 */
export function formulasUsingThis(
  formulas: Record<string, string>,
): Set<string> {
  const names = new Set<string>();
  for (const [name, source] of Object.entries(formulas)) {
    if (expressionUsesThis(source)) {
      names.add(name);
    }
  }
  return names;
}

/**
 * Determine whether a view requires a context (`--context`) to produce
 * meaningful results.
 *
 * A view requires context when:
 * 1. The base-level filters reference `this` (applied to all views)
 * 2. The view's own filters reference `this`
 * 3. Any formula in the base definition references `this`
 *
 * Rule 3 is deliberately broad: the engine eagerly evaluates ALL formulas
 * for every row in every view. If any formula depends on `this`, it will
 * produce null/wrong results without a context, regardless of whether the
 * view explicitly displays that formula.
 */
export function viewRequiresContext(
  view: BaseView,
  base: Pick<BaseDefinition, "filters" | "formulas">,
): boolean {
  if (filterUsesThis(base.filters)) {
    return true;
  }

  if (filterUsesThis(view.filters)) {
    return true;
  }

  if (formulasUsingThis(base.formulas).size > 0) {
    return true;
  }

  return false;
}

/**
 * Resolve `requiresContext` for all views in a base definition.
 * Returns the base definition with `requiresContext` set on each view.
 */
export function resolveContextRequirements(
  base: BaseDefinition,
): BaseDefinition {
  return {
    ...base,
    views: base.views.map((view) => ({
      ...view,
      requiresContext: viewRequiresContext(view, base),
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

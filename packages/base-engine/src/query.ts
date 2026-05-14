import {
  type BaseDefinition,
  type BasePropertyConfig,
  type BaseSort,
  type BaseView,
  parseExpression,
} from "@aliou/obsdx-base-ast";
import {
  BaseEngineError,
  type EvaluationContext,
  evaluateExpression,
} from "./expressions/evaluator";
import {
  maxNumber,
  meanNumbers,
  medianNumbers,
  minNumber,
  numericValues,
  stddevNumbers,
  sumNumbers,
} from "./math";
import type { BaseQueryResult } from "./result";

export type BaseFileInspection = {
  file: {
    path: string;
    name: string;
    basename: string;
    ext: string;
    folder: string;
    kind: string;
    ctime?: string;
    mtime?: string;
    size?: number;
    indexedAt?: string;
    parseError?: string | null;
  };
  properties: Array<{ name: string; value: unknown }>;
  tags: Array<{ tag: string }>;
  links: Array<{ resolvedPath?: string | null; targetText?: string | null }>;
  backlinks: unknown[];
  embeds: Array<{ resolvedPath?: string | null; targetText?: string | null }>;
};

export type BaseQueryOptions = {
  view?: string;
  context?: string;
};

export type BaseColumn = {
  id: string;
  displayName: string;
  type: string;
};

type BaseRow = {
  file: {
    path: string;
    name: string;
    basename: string;
    ext: string;
    folder: string;
    size?: number;
    ctime?: string;
    mtime?: string;
  };
  values: Record<string, unknown>;
  formulas: Record<string, unknown>;
  sortValues: Record<string, unknown>;
};

export function queryBase(
  base: BaseDefinition,
  inspections: BaseFileInspection[],
  options: BaseQueryOptions = {},
): BaseQueryResult {
  const byPath = new Map(
    inspections.map((inspection) => [inspection.file.path, inspection]),
  );
  const byBasename = new Map(
    inspections.map((inspection) => [
      normalizeComparable(inspection.file.basename),
      inspection,
    ]),
  );
  const context = options.context ? byPath.get(options.context) : undefined;
  const view = selectView(base, options.view);
  const columns = buildColumns(base, view);
  const rows: BaseRow[] = [];

  for (const inspection of inspections) {
    const formulas = evaluateFormulas(base, inspection, {
      row: inspection,
      context,
      formulas: {},
      byPath,
      byBasename,
    });
    const evalContext = {
      row: inspection,
      context,
      formulas,
      byPath,
      byBasename,
    };
    if (
      inspection.file.kind !== "markdown" ||
      !evaluateFilters(base.filters, evalContext) ||
      !evaluateFilters(view?.filters, evalContext)
    ) {
      continue;
    }

    rows.push({
      file: sanitizeRowFile(inspection.file),
      values: Object.fromEntries(
        columns.map((column) => [
          column.id,
          readColumnValue(column.id, evalContext),
        ]),
      ),
      formulas,
      sortValues: Object.fromEntries(
        (view?.sort ?? []).map((item) => [
          item.property,
          readColumnValue(item.property, evalContext),
        ]),
      ),
    });
  }

  rows.sort((left, right) => compareRows(left, right, view?.sort, columns));
  const limitedRows =
    view?.limit && view.limit > 0 ? rows.slice(0, view.limit) : rows;

  return {
    base: base.path,
    view: view?.name,
    context: options.context,
    columns,
    rows: limitedRows,
    groups: buildGroups(limitedRows, view),
    summaries: buildSummaries(limitedRows, view, base),
  };
}

function evaluateFormulas(
  base: BaseDefinition,
  _inspection: BaseFileInspection,
  context: EvaluationContext,
): Record<string, unknown> {
  const formulas: Record<string, unknown> = {};
  const evalContext = { ...context, formulas };
  const evaluating = new Set<string>();

  const evaluateFormula = (name: string): unknown => {
    if (Object.hasOwn(formulas, name)) {
      return formulas[name];
    }

    const source = base.formulas[name];
    if (source === undefined) {
      return null;
    }

    if (evaluating.has(name)) {
      throw new BaseEngineError(
        "FORMULA_EVAL_ERROR",
        `Circular formula reference: ${name}`,
        { formula: name },
      );
    }

    evaluating.add(name);
    try {
      formulas[name] = evaluateExpression(parseExpression(source), {
        ...evalContext,
        formulas: new Proxy(formulas, {
          get: (target, property) =>
            typeof property === "string"
              ? evaluateFormula(property)
              : Reflect.get(target, property),
        }),
      });
    } catch (error) {
      formulas[name] =
        error instanceof BaseEngineError
          ? error
          : new BaseEngineError(
              "FORMULA_EVAL_ERROR",
              error instanceof Error ? error.message : String(error),
              { formula: name },
            );
    }
    evaluating.delete(name);
    return formulas[name];
  };

  for (const name of Object.keys(base.formulas)) {
    evaluateFormula(name);
  }

  return formulas;
}

function evaluateFilters(
  filters: unknown,
  context: EvaluationContext,
): boolean {
  if (!filters) {
    return true;
  }

  if (typeof filters === "string") {
    return Boolean(evaluateExpression(parseExpression(filters), context));
  }

  if (Array.isArray(filters)) {
    return filters.every((filter) => evaluateFilters(filter, context));
  }

  if (!isRecord(filters)) {
    return true;
  }

  if (Array.isArray(filters.and)) {
    return filters.and.every((filter) => evaluateFilters(filter, context));
  }

  if (Array.isArray(filters.or)) {
    return filters.or.some((filter) => evaluateFilters(filter, context));
  }

  if (Array.isArray(filters.not)) {
    return !filters.not.some((filter) => evaluateFilters(filter, context));
  }

  return true;
}

function readColumnValue(id: string, context: EvaluationContext): unknown {
  const value = evaluateExpression(parseExpression(id), context);
  if (value !== null) {
    return value;
  }

  // Bare property name may map to note.{id} or file.{id}
  for (const qualified of [`note.${id}`, `file.${id}`]) {
    const resolved = evaluateExpression(parseExpression(qualified), context);
    if (resolved !== null) {
      return resolved;
    }
  }

  return null;
}

function selectView(
  base: BaseDefinition,
  requested: string | undefined,
): BaseView | undefined {
  if (!requested) {
    return base.views[0];
  }

  const view = base.views.find((v) => v.name === requested);
  if (!view) {
    throw new BaseEngineError(
      "BASE_VIEW_NOT_FOUND",
      `View not found: ${requested}`,
      { requested, availableViews: base.views.map((v) => v.name) },
    );
  }

  return view;
}

function buildColumns(
  base: BaseDefinition,
  view: BaseView | undefined,
): BaseColumn[] {
  const ids =
    view?.order && view.order.length > 0
      ? view.order
      : Object.keys(base.properties);

  return ids.map((id) => {
    const property = findPropertyConfig(base.properties, id);
    return {
      id,
      displayName: property?.displayName ?? defaultDisplayName(id),
      type: valueType(property),
    };
  });
}

function defaultDisplayName(id: string): string {
  if (id === "file.name") {
    return "name";
  }
  if (id === "file.mtime") {
    return "modified time";
  }
  if (id === "file.ctime") {
    return "created time";
  }
  if (id === "file.ext") {
    return "extension";
  }
  if (id === "file.path") {
    return "path";
  }
  return id.startsWith("formula.") ? id.slice("formula.".length) : id;
}

function findPropertyConfig(
  properties: Record<string, BasePropertyConfig>,
  id: string,
): BasePropertyConfig | undefined {
  return properties[id] ?? properties[`note.${id}`] ?? properties[`file.${id}`];
}

function valueType(_property: BasePropertyConfig | undefined): string {
  return "unknown";
}

function compareRows(
  left: BaseRow,
  right: BaseRow,
  sort: BaseSort[] | undefined,
  columns: BaseColumn[] = [],
): number {
  for (const item of sort ?? []) {
    const leftValue =
      left.sortValues[item.property] ??
      left.values[item.property] ??
      left.formulas[formulaName(item.property)];
    const rightValue =
      right.sortValues[item.property] ??
      right.values[item.property] ??
      right.formulas[formulaName(item.property)];
    const result = compareValues(leftValue, rightValue);
    if (result !== 0) {
      return item.direction === "DESC" ? -result : result;
    }
  }

  // When explicit sort ties, fall through to column order as tiebreaker
  // The tiebreaker inherits the sort direction of the last explicit sort
  const direction = sort?.length ? sort[sort.length - 1]?.direction : undefined;
  for (const column of columns) {
    const leftValue = left.values[column.id];
    const rightValue = right.values[column.id];
    const result = compareValues(leftValue, rightValue);
    if (result !== 0) {
      return direction === "DESC" ? -result : result;
    }
  }

  return compareValues(left.file.basename, right.file.basename);
}

function buildGroups(rows: BaseRow[], view: BaseView | undefined): unknown[] {
  const groupBy = view?.groupBy;
  const groupIds = groupBy ? [groupBy.property] : [];

  return groupIds.map((id) => {
    const buckets = new Map<string, { value: unknown; rows: BaseRow[] }>();
    for (const row of rows) {
      const value = row.values[id] ?? row.formulas[formulaName(id)] ?? null;
      const key = comparableKey(value);
      const bucket = buckets.get(key) ?? { value, rows: [] };
      bucket.rows.push(row);
      buckets.set(key, bucket);
    }

    const direction = groupBy?.property === id ? groupBy.direction : "ASC";
    const sortedBuckets = [...buckets.values()].sort((left, right) => {
      const result = compareValues(left.value, right.value);
      return direction === "DESC" ? -result : result;
    });

    return {
      property: id,
      direction,
      buckets: sortedBuckets.map((bucket) => ({
        value: bucket.value,
        count: bucket.rows.length,
        rows: bucket.rows.map((row) => row.file.path),
      })),
    };
  });
}

function buildSummaries(
  rows: BaseRow[],
  view: BaseView | undefined,
  base: BaseDefinition,
): Record<string, unknown> {
  const summaries: Record<string, unknown> = {
    count: rows.length,
  };

  for (const [key, requestedSummary] of Object.entries(view?.summaries ?? {})) {
    const values = rows.map(
      (row) => row.values[key] ?? row.formulas[formulaName(key)] ?? null,
    );
    summaries[key] = summarizeValues(
      values,
      typeof requestedSummary === "string"
        ? requestedSummary
        : String(requestedSummary),
      base,
    );
  }

  return summaries;
}

function summarizeValues(
  values: unknown[],
  requestedSummary: string,
  base: BaseDefinition,
): unknown {
  const custom = base.summaries?.[requestedSummary];
  if (custom) {
    return evaluateExpression(parseExpression(custom), {
      row: emptySummaryInspection(),
      formulas: {},
      byPath: new Map(),
      byBasename: new Map(),
      values,
    });
  }

  const normalized = requestedSummary.toLowerCase();
  const numbers = numericValues(values);
  const dates = values
    .map(dateFromValue)
    .filter((value): value is Date => value instanceof Date);

  if (normalized === "sum") return sumNumbers(numbers);
  if (normalized === "average" || normalized === "mean") {
    return meanNumbers(numbers);
  }
  if (normalized === "min") return minNumber(numbers);
  if (normalized === "max") return maxNumber(numbers);
  if (normalized === "median") return medianNumbers(numbers);
  if (normalized === "stddev") return stddevNumbers(numbers);
  if (normalized === "checked") {
    return values.filter((value) => value === true).length;
  }
  if (normalized === "unchecked") {
    return values.filter((value) => value === false).length;
  }
  if (normalized === "empty") return values.filter(isEmptySummaryValue).length;
  if (normalized === "filled") {
    return values.filter((value) => !isEmptySummaryValue(value)).length;
  }
  if (normalized === "unique") return new Set(values.map(comparableKey)).size;
  if (normalized === "earliest") return dateSummary(minDate(dates));
  if (normalized === "latest") return dateSummary(maxDate(dates));
  if (normalized === "range") {
    if (numbers.length > 0) {
      return Math.max(...numbers) - Math.min(...numbers);
    }
    const earliest = minDate(dates);
    const latest = maxDate(dates);
    return earliest && latest ? latest.getTime() - earliest.getTime() : null;
  }

  return {
    count: numbers.length,
    sum: sumNumbers(numbers),
    average: meanNumbers(numbers),
  };
}

function emptySummaryInspection(): BaseFileInspection {
  return {
    file: {
      path: "",
      name: "",
      basename: "",
      ext: "",
      folder: "",
      kind: "markdown",
    },
    properties: [],
    tags: [],
    links: [],
    backlinks: [],
    embeds: [],
  };
}

function dateFromValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function minDate(values: Date[]): Date | null {
  return values.length > 0
    ? new Date(Math.min(...values.map((value) => value.getTime())))
    : null;
}

function maxDate(values: Date[]): Date | null {
  return values.length > 0
    ? new Date(Math.max(...values.map((value) => value.getTime())))
    : null;
}

function dateSummary(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function isEmptySummaryValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function comparableKey(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

function sanitizeRowFile(file: BaseFileInspection["file"]): BaseRow["file"] {
  return {
    path: file.path,
    name: file.basename,
    basename: file.basename,
    ext: file.ext,
    folder: file.folder,
    size: file.size,
    ctime: file.ctime,
    mtime: file.mtime,
  };
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left ?? "").localeCompare(String(right ?? ""));
}

function formulaName(id: string): string {
  return id.startsWith("formula.") ? id.slice("formula.".length) : id;
}

function normalizeComparable(value: unknown): string {
  return String(value)
    .replace(/^\[\[/u, "")
    .replace(/\]\]$/u, "")
    .replace(/\.md$/u, "")
    .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

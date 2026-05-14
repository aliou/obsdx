import type { Expr } from "@aliou/obsdx-base-ast";
import {
  maxNumber,
  meanNumbers,
  medianNumbers,
  minNumber,
  stddevNumbers,
  sumNumbers,
} from "../math";
import type { BaseFileInspection } from "../query";

export class BaseEngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "BaseEngineError";
  }
}

export type EvaluationContext = {
  row: BaseFileInspection;
  context?: BaseFileInspection;
  formulas: Record<string, unknown>;
  byPath: Map<string, BaseFileInspection>;
  byBasename: Map<string, BaseFileInspection>;
  value?: unknown;
  acc?: unknown;
  values?: unknown[];
};

type Callable = {
  call: (args: unknown[]) => unknown;
};

type DurationValue = {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
  calendarYears?: number;
  calendarMonths?: number;
  calendarDays?: number;
};

export function evaluateExpression(
  expr: Expr,
  context: EvaluationContext,
): unknown {
  switch (expr.kind) {
    case "literal":
      return expr.value;
    case "regex":
      return new RegExp(expr.pattern, expr.flags);
    case "array":
      return expr.elements.map((element) =>
        evaluateExpression(element, context),
      );
    case "identifier":
      return readIdentifier(expr.name, context);
    case "member":
      return readMember(
        evaluateExpression(expr.object, context),
        expr.property,
        context,
      );
    case "index":
      return readIndex(
        evaluateExpression(expr.object, context),
        evaluateExpression(expr.index, context),
      );
    case "call":
      if (expr.callee.kind === "member" && expr.callee.property === "filter") {
        const source = listValue(
          evaluateExpression(expr.callee.object, context),
        );
        const predicate = expr.args[0];
        return predicate
          ? source.filter((value) =>
              truthy(evaluateExpression(predicate, { ...context, value })),
            )
          : source;
      }
      if (expr.callee.kind === "member" && expr.callee.property === "map") {
        const source = listValue(
          evaluateExpression(expr.callee.object, context),
        );
        const mapper = expr.args[0];
        return mapper
          ? source.map((value) =>
              evaluateExpression(mapper, { ...context, value }),
            )
          : source;
      }
      if (expr.callee.kind === "member" && expr.callee.property === "reduce") {
        const source = listValue(
          evaluateExpression(expr.callee.object, context),
        );
        const reducer = expr.args[0];
        if (!reducer) return null;
        let acc =
          expr.args.length > 1
            ? evaluateExpression(expr.args[1], context)
            : source[0];
        const values = expr.args.length > 1 ? source : source.slice(1);
        for (const value of values) {
          acc = evaluateExpression(reducer, { ...context, acc, value });
        }
        return acc;
      }
      if (expr.callee.kind === "member" && expr.callee.property === "matches") {
        const target = evaluateExpression(expr.callee.object, context);
        if (typeof target === "string") {
          throw new BaseEngineError(
            "FORMULA_EVAL_ERROR",
            'Cannot find function "matches" on type String',
          );
        }
      }
      if (expr.callee.kind === "identifier") {
        return callValue(
          readFunctionIdentifier(expr.callee.name, context) ??
            evaluateExpression(expr.callee, context),
          expr.args.map((arg) => evaluateExpression(arg, context)),
        );
      }
      return callValue(
        evaluateExpression(expr.callee, context),
        expr.args.map((arg) => evaluateExpression(arg, context)),
      );
    case "unary": {
      const value = evaluateExpression(expr.right, context);
      return expr.operator === "!" ? !truthy(value) : -numberValue(value);
    }
    case "binary":
      return evaluateBinary(
        expr.operator,
        evaluateExpression(expr.left, context),
        evaluateExpression(expr.right, context),
      );
  }
}

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

function readIdentifier(name: string, context: EvaluationContext): unknown {
  if (name === "file") {
    return fileObject(context.row, context);
  }

  if (name === "note") {
    return noteObject(context.row);
  }

  // In Obsidian, "property" is NOT a valid prefix -- it returns null.
  if (name === "property") {
    return null;
  }

  if (name === "formula") {
    return context.formulas;
  }

  if (name === "this") {
    return context.context ? thisObject(context.context, context) : null;
  }

  if (name === "value") {
    return context.value ?? null;
  }

  if (name === "acc") {
    return context.acc ?? null;
  }

  if (name === "values") {
    return context.values ?? null;
  }

  const property = readProperty(context.row, name);
  if (property !== null) {
    return property;
  }

  return null;
}

function readFunctionIdentifier(
  name: string,
  context: EvaluationContext,
): Callable | null {
  if (name === "list") {
    return callable((args) => {
      if (args.length > 1) {
        throw new BaseEngineError(
          "FORMULA_EVAL_ERROR",
          'Cannot call function "list", too many arguments.',
        );
      }
      return args.flatMap((arg) => listValue(arg));
    });
  }

  if (name === "link") {
    return callable((args) => {
      const target = String(args[0] ?? "");
      const display = args[1];
      // If already a wikilink, unwrap first to avoid double-wrapping.
      const unwrapped = target.replace(/^\[\[/u, "").replace(/\]\]$/u, "");
      if (display !== undefined && display !== null) {
        return `[[${unwrapped}|${String(display)}]]`;
      }
      return `[[${unwrapped}]]`;
    });
  }

  if (name === "if") {
    return callable((args) => (truthy(args[0]) ? args[1] : (args[2] ?? null)));
  }

  if (name === "now") {
    return callable(() => new Date());
  }

  if (name === "today") {
    return callable(() => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    });
  }

  if (name === "date") {
    return callable((args) => dateValue(args[0]));
  }

  if (name === "duration") {
    return callable((args) => {
      if (typeof args[0] === "string") {
        return parseDuration(args[0]) ?? null;
      }
      if (typeof args[0] === "number") {
        return durationValue(args[0]);
      }
      return null;
    });
  }

  if (name === "number") {
    return callable((args) => {
      const val = args[0];
      if (typeof val === "boolean") {
        return val ? 1 : 0;
      }
      const result = numberValue(val);
      if (
        typeof val === "string" &&
        val.trim() !== "" &&
        !Number.isFinite(Number(val))
      ) {
        throw new BaseEngineError(
          "FORMULA_EVAL_ERROR",
          `Unable to parse "${val}" as a number.`,
        );
      }
      return result;
    });
  }

  if (name === "file") {
    return callable((args) => {
      const target = String(args[0] ?? "");
      const inspection =
        context.byPath.get(target) ??
        context.byBasename.get(normalizeComparable(target));
      return inspection ? fileObject(inspection, context) : null;
    });
  }

  if (name === "min") {
    return callable((args) => Math.min(...args.map((a) => numberValue(a))));
  }

  if (name === "max") {
    return callable((args) => Math.max(...args.map((a) => numberValue(a))));
  }

  if (name === "escapeHTML") {
    return callable((args) => escapeHtml(String(args[0] ?? "")));
  }

  if (name === "html") {
    return callable((args) => String(args[0] ?? ""));
  }

  if (name === "image") {
    return callable((args) => `![](${String(args[0] ?? "")})`);
  }

  if (name === "icon") {
    return callable((args) => String(args[0] ?? ""));
  }

  if (name === "random") {
    return callable(() => Math.random());
  }

  return null;
}

// ---------------------------------------------------------------------------
// Member access
// ---------------------------------------------------------------------------

function readMember(
  value: unknown,
  property: string,
  context: EvaluationContext,
): unknown {
  // --- null-safe default returns ---
  if (value === null || value === undefined) {
    if (property === "isEmpty") {
      return callable(() => true);
    }
    if (property === "contains" || property === "containsAny") {
      return callable(() => false);
    }
    if (
      property === "asLink" ||
      property === "asFile" ||
      property === "hasLink" ||
      property === "hasProperty" ||
      property === "hasTag" ||
      property === "inFolder"
    ) {
      return callable(() => null);
    }
    if (property === "round" || property === "floor" || property === "ceil") {
      return callable(() => null);
    }
    if (property === "toFixed") {
      return callable(() => null);
    }
    if (property === "toString") {
      return callable(() => "");
    }
    if (property === "matches") {
      return callable(() => false);
    }
    if (property === "join" || property === "sort" || property === "map") {
      return callable(() => []);
    }
    if (property === "containsAll") {
      return callable(() => false);
    }
    if (property === "format") {
      return callable(() => null);
    }
    if (property === "keys" || property === "values") {
      return callable(() => []);
    }
    if (property === "length") {
      return 0;
    }
    return null;
  }

  // --- Duration fields ---
  if (isDuration(value) && property in value) {
    return value[property as keyof DurationValue];
  }

  if (value instanceof RegExp) {
    if (property === "matches") {
      return callable((args) => value.test(String(args[0] ?? "")));
    }
  }

  // --- Array methods ---
  if (Array.isArray(value)) {
    if (property === "length") {
      return value.length;
    }
    if (property === "contains") {
      return callable((args) =>
        value.some((item) => sameComparable(item, args[0])),
      );
    }
    if (property === "containsAny") {
      return callable((args) =>
        value.some((item) =>
          args
            .flatMap((arg) => listValue(arg))
            .some((arg) => sameComparable(item, arg)),
        ),
      );
    }
    if (property === "isEmpty") {
      return callable(() => value.length === 0);
    }
    if (property === "unique") {
      return callable(() => uniqueValues(value));
    }
    if (property === "sum") {
      return callable(() => sumNumbers(value));
    }
    if (property === "mean" || property === "average") {
      return callable(() => meanNumbers(value));
    }
    if (property === "min") {
      return callable(() => minNumber(value));
    }
    if (property === "max") {
      return callable(() => maxNumber(value));
    }
    if (property === "median") {
      return callable(() => medianNumbers(value));
    }
    if (property === "stddev") {
      return callable(() => stddevNumbers(value));
    }
    if (property === "filter") {
      return callable((args) => {
        const predicate = args[0];
        return typeof predicate === "function"
          ? value.filter((item) => Boolean(predicate(item)))
          : value;
      });
    }
    if (property === "containsAll") {
      return callable((args) => {
        const required = args.flatMap((arg) => listValue(arg));
        return required.every((item) =>
          value.some((v) => sameComparable(v, item)),
        );
      });
    }
    if (property === "join") {
      return callable((args) => value.join(String(args[0] ?? ", ")));
    }
    if (property === "sort") {
      return callable(() => [...value].sort(compareValuesForSort));
    }
    if (property === "map") {
      return callable((args) => {
        const fn = args[0];
        return typeof fn === "function" ? value.map((item) => fn(item)) : value;
      });
    }
    if (property === "reduce") {
      return callable(() => null);
    }
    if (property === "flat") {
      return callable(() => value.flat(Number.POSITIVE_INFINITY));
    }
    if (property === "reverse") {
      return callable(() => [...value].reverse());
    }
    if (property === "slice") {
      return callable((args) => {
        const start = numberValue(args[0]);
        const end = args[1] !== undefined ? numberValue(args[1]) : undefined;
        return value.slice(start, end);
      });
    }
  }

  // --- String methods ---
  if (typeof value === "string") {
    if (property === "length") {
      return value.length;
    }
    if (property === "contains") {
      return callable((args) =>
        normalizeComparable(value).includes(normalizeComparable(args[0])),
      );
    }
    if (property === "containsAny") {
      return callable((args) =>
        args
          .flatMap((arg) => listValue(arg))
          .some((arg) =>
            normalizeComparable(value).includes(normalizeComparable(arg)),
          ),
      );
    }
    if (property === "isEmpty") {
      return callable(() => value.length === 0);
    }
    if (property === "toString") {
      return callable(() => value);
    }
    if (property === "asFile") {
      return callable(() => lookupFile(value, context));
    }
    if (property === "linksTo") {
      return callable((args) => {
        const source = lookupFile(value, context);
        const target = linkTarget(args[0]);
        return Boolean(
          source &&
            sameComparable(
              isRecord(source) && isRecord(source.file)
                ? source.file.path
                : source.path,
              target,
            ),
        );
      });
    }
    if (property === "lower") {
      return callable(() => value.toLowerCase());
    }
    if (property === "title") {
      return callable(() =>
        value.replace(/\b\w/gu, (char) => char.toUpperCase()),
      );
    }
    if (property === "trim") {
      return callable(() => value.trim());
    }
    if (property === "startsWith") {
      return callable((args) => value.startsWith(String(args[0] ?? "")));
    }
    if (property === "endsWith") {
      return callable((args) => value.endsWith(String(args[0] ?? "")));
    }
    if (property === "replace") {
      // In Obsidian, string.replace() replaces ALL occurrences.
      return callable((args) => {
        const pattern = String(args[0] ?? "");
        const replacement = String(args[1] ?? "");
        return value.split(pattern).join(replacement);
      });
    }
    if (property === "repeat") {
      return callable((args) => value.repeat(numberValue(args[0])));
    }
    if (property === "reverse") {
      return callable(() => [...value].reverse().join(""));
    }
    if (property === "slice") {
      return callable((args) => {
        const start = numberValue(args[0]);
        const end = args[1] !== undefined ? numberValue(args[1]) : undefined;
        return value.slice(start, end);
      });
    }
    if (property === "split") {
      return callable((args) => value.split(String(args[0] ?? "")));
    }
    // Date-like string methods (file.mtime is a string, not a Date)
    if (property === "relative") {
      const d = dateValue(value);
      if (d) return callable(() => relativeTime(d));
    }
    if (property === "date") {
      const d = dateValue(value);
      if (d)
        return callable(
          () => new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        );
    }
    if (property === "time") {
      const d = dateValue(value);
      if (d)
        return callable(() => {
          const pad = (n: number) => String(n).padStart(2, "0");
          return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        });
    }
    if (property === "format") {
      const d = dateValue(value);
      if (d)
        return callable((args) => {
          const pattern = String(args[0] ?? "YYYY-MM-DD");
          return formatDate(d, pattern);
        });
    }
  }

  // --- Number methods ---
  if (typeof value === "number") {
    if (property === "round") {
      return callable((args) => {
        const digits = args[0];
        if (digits === undefined || digits === null) {
          return Math.round(value);
        }
        const d = numberValue(digits);
        const factor = 10 ** d;
        return Math.round(value * factor) / factor;
      });
    }
    if (property === "floor") {
      return callable(() => Math.floor(value));
    }
    if (property === "ceil") {
      return callable(() => Math.ceil(value));
    }
    if (property === "abs") {
      return callable(() => Math.abs(value));
    }
    if (property === "toFixed") {
      return callable((args) => value.toFixed(numberValue(args[0])));
    }
    if (property === "isEmpty") {
      return callable(() => false);
    }
  }

  // --- Date methods and fields ---
  if (value instanceof Date) {
    if (property === "year") {
      return value.getFullYear();
    }
    if (property === "month") {
      return value.getMonth() + 1;
    }
    if (property === "day") {
      return value.getDate();
    }
    if (property === "hour") {
      return value.getHours();
    }
    if (property === "minute") {
      return value.getMinutes();
    }
    if (property === "second") {
      return value.getSeconds();
    }
    if (property === "millisecond") {
      return value.getMilliseconds();
    }
    if (property === "date") {
      return callable(
        () => new Date(value.getFullYear(), value.getMonth(), value.getDate()),
      );
    }
    if (property === "time") {
      return callable(() => {
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
      });
    }
    if (property === "relative") {
      return callable(() => relativeTime(value));
    }
    if (property === "isEmpty") {
      return callable(() => false);
    }
    if (property === "toString") {
      return callable(() => formatDateTimeForOutput(value));
    }
    if (property === "format") {
      return callable((args) => {
        const pattern = String(args[0] ?? "YYYY-MM-DD");
        return formatDate(value, pattern);
      });
    }
  }

  // --- Any-type methods ---
  if (property === "isTruthy") {
    return callable(() => truthy(value));
  }
  if (property === "isType") {
    return callable((args) => {
      const expected = String(args[0] ?? "");
      if (expected === "number") return typeof value === "number";
      if (expected === "string") return typeof value === "string";
      if (expected === "boolean") return typeof value === "boolean";
      if (expected === "null") return value === null;
      if (expected === "date") return value instanceof Date;
      if (expected === "list") return Array.isArray(value);
      if (expected === "object") return isRecord(value);
      return false;
    });
  }
  if (property === "toString") {
    return callable(() => String(value ?? ""));
  }
  if (property === "isEmpty") {
    return callable(() => isEmpty(value));
  }

  // --- Object methods ---
  if (isRecord(value)) {
    if (property === "keys") {
      return callable(() => Object.keys(value));
    }
    if (property === "values") {
      return callable(() => Object.values(value));
    }

    const direct = value[property];
    if (direct !== undefined) {
      return direct;
    }

    if (property in value) {
      return value[property];
    }

    const normalized = normalizeName(property);
    for (const [key, item] of Object.entries(value)) {
      if (normalizeName(key) === normalized) {
        return item;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Index access
// ---------------------------------------------------------------------------

function readIndex(value: unknown, index: unknown): unknown {
  // Object bracket access: note["price"] same as note.price
  if (isRecord(value) && typeof index === "string") {
    if (index in value) {
      return value[index];
    }
    const normalized = normalizeName(index);
    for (const [key, item] of Object.entries(value)) {
      if (normalizeName(key) === normalized) {
        return item;
      }
    }
    return null;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  return value[numberValue(index)] ?? null;
}

// ---------------------------------------------------------------------------
// Binary operators
// ---------------------------------------------------------------------------

function callValue(callee: unknown, args: unknown[]): unknown {
  if (isCallable(callee)) {
    return callee.call(args);
  }

  throw new BaseEngineError(
    "FORMULA_EVAL_ERROR",
    "Expression value is not callable",
  );
}

function evaluateBinary(
  operator: string,
  left: unknown,
  right: unknown,
): unknown {
  switch (operator) {
    case "&&":
      return truthy(left) && truthy(right);
    case "||":
      return truthy(left) || truthy(right);
    case "==":
      return equalValues(left, right);
    case "!=":
      return !equalValues(left, right);
    case "<":
      return comparableNumber(left) < comparableNumber(right);
    case "<=":
      return comparableNumber(left) <= comparableNumber(right);
    case ">":
      return comparableNumber(left) > comparableNumber(right);
    case ">=":
      return comparableNumber(left) >= comparableNumber(right);
    case "+":
      return addValues(left, right);
    case "-":
      return subtractValues(left, right);
    case "*":
      return multiplyValues(left, right);
    case "/":
      return numberValue(left) / numberValue(right);
    case "%":
      return numberValue(left) % numberValue(right);
    default:
      throw new BaseEngineError(
        "UNSUPPORTED_FORMULA",
        `Unsupported operator: ${operator}`,
        { operator },
      );
  }
}

function addValues(left: unknown, right: unknown): unknown {
  // Date + duration string: date("2023-09-12") + "1d"
  const leftDate = dateValue(left);
  if (leftDate && typeof right === "string") {
    const duration = parseDuration(right);
    if (duration) {
      return addDurationToDate(leftDate, duration, 1);
    }
  }

  if (typeof left === "string" || typeof right === "string") {
    return String(left ?? "") + String(right ?? "");
  }

  return numberValue(left) + numberValue(right);
}

function subtractValues(left: unknown, right: unknown): unknown {
  const leftDate = dateValue(left);
  const rightDate = dateValue(right);
  if ((leftDate && isEmpty(right)) || (rightDate && isEmpty(left))) {
    return null;
  }
  if (leftDate && rightDate) {
    const milliseconds = leftDate.valueOf() - rightDate.valueOf();
    return durationValue(milliseconds);
  }

  if (leftDate && typeof right === "string") {
    const duration = parseDuration(right);
    if (duration) {
      return addDurationToDate(leftDate, duration, -1);
    }
  }

  return numberValue(left) - numberValue(right);
}

function multiplyValues(left: unknown, right: unknown): unknown {
  // duration * scalar
  if (isDuration(left)) {
    const scalar = numberValue(right);
    return durationValue(left.milliseconds * scalar);
  }
  if (isDuration(right)) {
    const scalar = numberValue(left);
    return durationValue(right.milliseconds * scalar);
  }
  return numberValue(left) * numberValue(right);
}

// ---------------------------------------------------------------------------
// Object constructors
// ---------------------------------------------------------------------------

function fileObject(
  inspection: BaseFileInspection,
  _context: EvaluationContext,
): Record<string, unknown> {
  const file = fileReference(inspection);

  return {
    ...file,
    file,
    tags: inspection.tags.map((tag) => `#${tag.tag.replace(/^#/, "")}`),
    links: inspection.links.flatMap((link) => link.resolvedPath ?? []),
    backlinks: inspection.backlinks,
    embeds: inspection.embeds.map(
      (link) => link.resolvedPath ?? link.targetText,
    ),
    properties: noteObject(inspection),
    asLink: callable(() => `[[${inspection.file.path}]]`),
    inFolder: callable(
      (args) =>
        inspection.file.folder === String(args[0] ?? "") ||
        inspection.file.folder.startsWith(`${String(args[0] ?? "")}/`),
    ),
    hasTag: callable((args) =>
      inspection.tags.some((tag) =>
        args.some((arg) => tagMatches(tag.tag, arg)),
      ),
    ),
    hasLink: callable((args) => {
      const target = linkTarget(args[0]);
      return inspection.links.some((link) =>
        sameComparable(link.resolvedPath ?? link.targetText, target),
      );
    }),
    hasProperty: callable((args) =>
      inspection.properties.some((property) =>
        sameComparable(property.name, args[0]),
      ),
    ),
  };
}

function thisObject(
  inspection: BaseFileInspection,
  context: EvaluationContext,
): Record<string, unknown> {
  return {
    file: fileObject(inspection, context),
    asLink: callable(() => `[[${inspection.file.path}]]`),
    ...noteObject(inspection),
  };
}

function fileReference(
  inspection: BaseFileInspection,
): Record<string, string | number | undefined> {
  return {
    name: inspection.file.basename,
    basename: inspection.file.basename,
    path: inspection.file.path,
    folder: inspection.file.folder,
    ext: inspection.file.ext,
    size: inspection.file.size,
    ctime: dateTimeString(inspection.file.ctime),
    mtime: dateTimeString(inspection.file.mtime),
  };
}

function noteObject(inspection: BaseFileInspection): Record<string, unknown> {
  return Object.fromEntries(
    inspection.properties.map((property) => [property.name, property.value]),
  );
}

function readProperty(inspection: BaseFileInspection, name: string): unknown {
  const property = inspection.properties.find(
    (candidate) => normalizeName(candidate.name) === normalizeName(name),
  );
  if (!property) return null;
  if (property.name === "tags" && Array.isArray(property.value)) {
    return property.value.map((tag) => `#${String(tag).replace(/^#/, "")}`);
  }
  return property.value;
}

function linkTarget(value: unknown): unknown {
  if (isRecord(value) && typeof value.path === "string") {
    return value.path;
  }

  if (
    isRecord(value) &&
    isRecord(value.file) &&
    typeof value.file.path === "string"
  ) {
    return value.file.path;
  }

  return value;
}

function lookupFile(
  value: unknown,
  context: EvaluationContext,
): Record<string, unknown> | null {
  const target = normalizeComparable(value);
  const inspection =
    context.byPath.get(String(value)) ?? context.byBasename.get(target);
  return inspection ? fileObject(inspection, context) : null;
}

// ---------------------------------------------------------------------------
// Primitives and type coercion
// ---------------------------------------------------------------------------

function callable(call: (args: unknown[]) => unknown): Callable {
  return { call };
}

function isCallable(value: unknown): value is Callable {
  return isRecord(value) && typeof value.call === "function";
}

function listValue(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined || value === "") {
    return [];
  }

  return [value];
}

function truthy(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return Boolean(value);
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === "") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
}

function numberValue(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (value instanceof Date) {
    return value.valueOf();
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (isDuration(value)) {
    return value.milliseconds;
  }

  return 0;
}

function comparableNumber(value: unknown): number {
  const date = dateValue(value);
  return date ? date.valueOf() : numberValue(value);
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const trimmed = value.trim();
  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
  }

  const dateTime = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)$/u,
  );
  if (dateTime) {
    return new Date(
      Number(dateTime[1]),
      Number(dateTime[2]) - 1,
      Number(dateTime[3]),
      Number(dateTime[4] ?? 0),
      Number(dateTime[5] ?? 0),
      Number(dateTime[6] ?? 0),
      Number((dateTime[7] ?? "0").padEnd(3, "0")),
    );
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

// ---------------------------------------------------------------------------
// Duration system
// ---------------------------------------------------------------------------

// Unit definitions: short form and named form.
// Obsidian uses fixed conversions: 1M = 31d, 1y = 365d (not 30.44 / 365.25).
const DURATION_UNITS: Array<{
  pattern: string;
  toDays: number;
  field: "days" | "hours" | "minutes" | "seconds" | "months" | "years";
}> = [
  { pattern: "d", toDays: 1, field: "days" },
  { pattern: "w", toDays: 7, field: "days" },
  { pattern: "M", toDays: 31, field: "months" },
  { pattern: "y", toDays: 365, field: "years" },
  { pattern: "h", toDays: 1 / 24, field: "hours" },
  { pattern: "m", toDays: 1 / 1440, field: "minutes" },
  { pattern: "s", toDays: 1 / 86400, field: "seconds" },
  { pattern: "day", toDays: 1, field: "days" },
  { pattern: "days", toDays: 1, field: "days" },
  { pattern: "week", toDays: 7, field: "days" },
  { pattern: "weeks", toDays: 7, field: "days" },
  { pattern: "month", toDays: 31, field: "months" },
  { pattern: "months", toDays: 31, field: "months" },
  { pattern: "year", toDays: 365, field: "years" },
  { pattern: "years", toDays: 365, field: "years" },
  { pattern: "hour", toDays: 1 / 24, field: "hours" },
  { pattern: "hours", toDays: 1 / 24, field: "hours" },
  { pattern: "minute", toDays: 1 / 1440, field: "minutes" },
  { pattern: "minutes", toDays: 1 / 1440, field: "minutes" },
  { pattern: "second", toDays: 1 / 86400, field: "seconds" },
  { pattern: "seconds", toDays: 1 / 86400, field: "seconds" },
];

function parseDuration(value: string): DurationValue | null {
  // Try short form: /^(\d+)([dwMmyhs])$/
  const shortMatch = value.match(/^(\d+)([dwMmyhs])$/u);
  if (shortMatch) {
    const amount = Number(shortMatch[1]);
    const unit = shortMatch[2];
    const unitDef = DURATION_UNITS.find((u) => u.pattern === unit);
    if (unitDef) {
      return durationValue(
        amount * unitDef.toDays * 86_400_000,
        unitDef.field === "years" ? amount : 0,
        unitDef.field === "months" ? amount : 0,
        unitDef.field === "days" ? amount * unitDef.toDays : 0,
      );
    }
  }

  // Try named form: /^(\d+)\s+(day|days|week|...)$/
  const namedMatch = value.match(/^(\d+)\s+(\S+)$/u);
  if (namedMatch) {
    const amount = Number(namedMatch[1]);
    const unitName = namedMatch[2];
    const unitDef = DURATION_UNITS.find((u) => u.pattern === unitName);
    if (unitDef) {
      return durationValue(
        amount * unitDef.toDays * 86_400_000,
        unitDef.field === "years" ? amount : 0,
        unitDef.field === "months" ? amount : 0,
        unitDef.field === "days" ? amount * unitDef.toDays : 0,
      );
    }
  }

  return null;
}

function durationValue(
  milliseconds: number,
  calendarYears = 0,
  calendarMonths = 0,
  calendarDays = 0,
): DurationValue {
  return {
    milliseconds,
    days: nearInteger(milliseconds / 86_400_000),
    hours: nearInteger(milliseconds / 3_600_000),
    minutes: nearInteger(milliseconds / 60_000),
    seconds: nearInteger(milliseconds / 1_000),
    months: nearInteger(
      milliseconds / ((365.28478589915085 * 86_400_000) / 12),
    ),
    years: nearInteger(milliseconds / (365.28478589915085 * 86_400_000)),
    calendarYears,
    calendarMonths,
    calendarDays,
  };
}

function nearInteger(value: number): number {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < 1e-9 ? rounded : value;
}

function addDurationToDate(
  date: Date,
  duration: DurationValue,
  direction: 1 | -1,
): Date {
  const next = new Date(date.valueOf());
  const calendarYears = duration.calendarYears ?? 0;
  const calendarMonths = duration.calendarMonths ?? 0;
  const calendarDays = duration.calendarDays ?? 0;
  if (calendarYears !== 0) {
    next.setFullYear(next.getFullYear() + direction * calendarYears);
  }
  if (calendarMonths !== 0) {
    next.setMonth(next.getMonth() + direction * calendarMonths);
  }
  if (calendarDays !== 0) {
    next.setDate(next.getDate() + direction * calendarDays);
  }
  const calendarMilliseconds =
    calendarYears * 365 * 86_400_000 +
    calendarMonths * 31 * 86_400_000 +
    calendarDays * 86_400_000;
  const clockMilliseconds = duration.milliseconds - calendarMilliseconds;
  if (clockMilliseconds !== 0) {
    next.setTime(next.valueOf() + direction * clockMilliseconds);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Formatting and normalization
// ---------------------------------------------------------------------------

function dateTimeString(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return formatDateTimeForOutput(date);
}

function formatDateTimeForOutput(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
  if (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  ) {
    return datePart;
  }
  return `${datePart}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}`;
}

function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.valueOf();
  const absDiff = Math.abs(diff);
  const isPast = diff > 0;

  const seconds = Math.floor(absDiff / 1_000);
  const minutes = Math.floor(absDiff / 60_000);
  const hours = Math.floor(absDiff / 3_600_000);
  const days = Math.floor(absDiff / 86_400_000);
  const months = Math.floor(absDiff / (31 * 86_400_000));
  const years = Math.floor(absDiff / (365 * 86_400_000));

  const suffix = isPast ? "ago" : "from now";

  if (years > 0) return `${years} year${years > 1 ? "s" : ""} ${suffix}`;
  if (months > 0) return `${months} month${months > 1 ? "s" : ""} ${suffix}`;
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ${suffix}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ${suffix}`;
  if (minutes > 0)
    return `${minutes} minute${minutes > 1 ? "s" : ""} ${suffix}`;
  if (seconds > 0)
    return `${seconds} second${seconds > 1 ? "s" : ""} ${suffix}`;
  return "just now";
}

function uniqueValues(values: unknown[]): unknown[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeComparable(value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function sameComparable(left: unknown, right: unknown): boolean {
  return normalizeComparable(left) === normalizeComparable(right);
}

function equalValues(left: unknown, right: unknown): boolean {
  if (typeof left === "string" && typeof right === "string") {
    return left === right;
  }
  return sameComparable(left, right);
}

function normalizeComparable(value: unknown): string {
  if (isRecord(value) && typeof value.path === "string") {
    return normalizeComparable(value.path);
  }

  if (
    isRecord(value) &&
    isRecord(value.file) &&
    typeof value.file.path === "string"
  ) {
    return normalizeComparable(value.file.path);
  }

  // Strip # prefix for tag comparisons so "#book" matches "book"
  return (
    String(value)
      .replace(/^#/u, "")
      .replace(/^\[\[/u, "")
      .replace(/\]\]$/u, "")
      .replace(/\.md$/u, "")
      .split("/")
      .at(-1)
      ?.toLowerCase() ?? ""
  );
}

function tagMatches(tag: string, value: unknown): boolean {
  const normalizedTag = normalizeComparable(tag);
  const normalizedValue = normalizeComparable(value);
  return (
    normalizedTag === normalizedValue ||
    normalizedTag.startsWith(`${normalizedValue}/`)
  );
}

function normalizeName(name: string): string {
  return name.replace(/-/gu, "").toLowerCase();
}

function isDuration(value: unknown): value is DurationValue {
  return (
    isRecord(value) &&
    typeof value.milliseconds === "number" &&
    typeof value.days === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatDate(date: Date, pattern: string): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");

  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const dayNamesShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const monthNamesShort = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const day = date.getDate();
  const ordinal = (n: number): string => {
    const suffix = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]);
  };

  // Replace longest patterns first to avoid partial matches.
  return pattern
    .replace(/dddd/gu, dayNames[date.getDay()] ?? "")
    .replace(/ddd/gu, dayNamesShort[date.getDay()] ?? "")
    .replace(/DD/gu, pad(date.getDate()))
    .replace(/Do/gu, ordinal(day))
    .replace(/MMMM/gu, monthNames[date.getMonth()] ?? "")
    .replace(/MMM/gu, monthNamesShort[date.getMonth()] ?? "")
    .replace(/MM/gu, pad(date.getMonth() + 1))
    .replace(/YYYY/gu, String(date.getFullYear()))
    .replace(/YY/gu, String(date.getFullYear()).slice(-2))
    .replace(/HH/gu, pad(date.getHours()))
    .replace(/mm/gu, pad(date.getMinutes()))
    .replace(/ss/gu, pad(date.getSeconds()));
}

function compareValuesForSort(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

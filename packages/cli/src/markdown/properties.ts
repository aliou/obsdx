export type NormalizedProperties = {
  values: Record<string, unknown>;
  valueTypes: Record<string, string>;
};

export function normalizeProperties(
  properties: Record<string, unknown>,
  propertyTypes: Record<string, string> = {},
): NormalizedProperties {
  const values: Record<string, unknown> = {};
  const valueTypes: Record<string, string> = {};

  for (const [name, rawValue] of Object.entries(properties)) {
    const configuredType = propertyTypes[name] ?? inferPropertyType(rawValue);
    values[name] = normalizePropertyValue(rawValue, configuredType);
    valueTypes[name] = configuredType;
  }

  return {
    values,
    valueTypes,
  };
}

function normalizePropertyValue(value: unknown, type: string): unknown {
  switch (type) {
    case "aliases":
    case "tags":
    case "multitext":
      return normalizeList(value);
    case "number":
      return normalizeNumber(value);
    case "checkbox":
      return normalizeBoolean(value);
    case "date":
      return normalizeDate(value);
    case "datetime":
      return normalizeDateTime(value);
    default:
      return value;
  }
}

function normalizeList(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeList(item));
  }

  if (value === null || value === undefined || value === "") {
    return [];
  }

  return [value];
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (["true", "yes", "1"].includes(value.toLowerCase())) {
      return true;
    }
    if (["false", "no", "0"].includes(value.toLowerCase())) {
      return false;
    }
  }

  return null;
}

function normalizeDate(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    return /^\d{4}-\d{2}-\d{2}/u.test(value) ? value.slice(0, 10) : value;
  }

  return null;
}

function normalizeDateTime(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? value : date.toISOString();
  }

  return null;
}

function inferPropertyType(value: unknown): string {
  if (Array.isArray(value)) {
    return "list";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

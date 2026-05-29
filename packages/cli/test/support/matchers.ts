import type { DatabaseSync } from "node:sqlite";
import { expect } from "vitest";

type FilePartial = {
  kind?: string;
  ext?: string;
  folder?: string;
};

declare module "vitest" {
  // biome-ignore lint/suspicious/noExplicitAny: must match vitest's Matchers signature
  interface Matchers<T = any> {
    toHaveIndexedFile(path: string, partial?: FilePartial): T;
    toHaveIndexedProperty(
      filePath: string,
      name: string,
      value: unknown,
      valueType?: string,
    ): T;
    toHaveResolvedLink(sourcePath: string, raw: string, targetPath: string): T;
    toHaveUnresolvedLink(sourcePath: string, raw: string): T;
    toHaveTag(filePath: string, tag: string): T;
  }
}

expect.extend({
  toHaveIndexedFile(
    db: DatabaseSync,
    filePath: string,
    partial: FilePartial = {},
  ) {
    const row = db.prepare("select * from files where path = ?").get(filePath);
    const pass =
      isRecord(row) &&
      Object.entries(partial).every(([key, value]) => row[key] === value);

    return {
      pass,
      message: () =>
        pass
          ? `expected DB not to index file ${this.utils.printExpected(filePath)}`
          : `expected DB to index file ${this.utils.printExpected(filePath)} with ${this.utils.printExpected(partial)}, got ${this.utils.printReceived(row)}`,
    };
  },

  toHaveIndexedProperty(
    db: DatabaseSync,
    filePath: string,
    name: string,
    value: unknown,
    valueType?: string,
  ) {
    const row = db
      .prepare(
        "select value_json as valueJson, value_type as valueType from properties where file_path = ? and name = ?",
      )
      .get(filePath, name) as
      | { valueJson: string; valueType: string }
      | undefined;
    const actual = row ? JSON.parse(row.valueJson) : undefined;
    const pass =
      row !== undefined &&
      this.equals(actual, value) &&
      (valueType === undefined || row.valueType === valueType);

    return {
      pass,
      message: () =>
        pass
          ? `expected DB not to index property ${name} on ${filePath}`
          : `expected DB property ${name} on ${filePath} to be ${this.utils.printExpected(value)} (${valueType ?? "any type"}), got ${this.utils.printReceived({ value: actual, valueType: row?.valueType })}`,
    };
  },

  toHaveResolvedLink(
    db: DatabaseSync,
    sourcePath: string,
    raw: string,
    targetPath: string,
  ) {
    const row = db
      .prepare(
        "select resolved_path as resolvedPath from links where source_path = ? and raw = ?",
      )
      .get(sourcePath, raw) as { resolvedPath: string | null } | undefined;
    const pass = row?.resolvedPath === targetPath;

    return {
      pass,
      message: () =>
        pass
          ? `expected DB not to resolve ${raw} from ${sourcePath} to ${targetPath}`
          : `expected DB to resolve ${raw} from ${sourcePath} to ${targetPath}, got ${this.utils.printReceived(row)}`,
    };
  },

  toHaveUnresolvedLink(db: DatabaseSync, sourcePath: string, raw: string) {
    const row = db
      .prepare(
        "select resolved_path as resolvedPath, unresolved from links where source_path = ? and raw = ?",
      )
      .get(sourcePath, raw) as
      | { resolvedPath: string | null; unresolved: number }
      | undefined;
    const pass = row?.unresolved === 1;

    return {
      pass,
      message: () =>
        pass
          ? `expected DB not to have unresolved link ${raw} from ${sourcePath}`
          : `expected DB to have unresolved link ${raw} from ${sourcePath}, got ${this.utils.printReceived({ resolvedPath: row?.resolvedPath, unresolved: row?.unresolved })}`,
    };
  },

  toHaveTag(db: DatabaseSync, filePath: string, tag: string) {
    const row = db
      .prepare("select 1 from tags where file_path = ? and tag = ? limit 1")
      .get(filePath, tag);
    const pass = row !== undefined;

    return {
      pass,
      message: () =>
        pass
          ? `expected DB not to index tag ${tag} on ${filePath}`
          : `expected DB to index tag ${tag} on ${filePath}`,
    };
  },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

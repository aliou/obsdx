/**
 * Shared helpers for Obsidian Bases accuracy tests.
 *
 * Verified against Obsidian 1.12.7 using the `obsidian` CLI
 * against the bases-verification-vault fixture.
 */

import { parseBase } from "@aliou/obsdx-base-ast";
import type { BaseFileInspection } from "../../src";
import { queryBase } from "../../src";

export function file(
  path: string,
  basename: string,
  properties: BaseFileInspection["properties"],
  overrides?: Partial<BaseFileInspection>,
): BaseFileInspection {
  return {
    file: {
      path,
      name: `${basename}.md`,
      basename,
      ext: ".md",
      folder: path.split("/").slice(0, -1).join("/"),
      kind: "markdown",
    },
    properties,
    tags: [],
    links: [],
    backlinks: [],
    embeds: [],
    ...overrides,
  };
}

export function taggedFile(
  path: string,
  basename: string,
  tags: string[],
  properties: BaseFileInspection["properties"],
): BaseFileInspection {
  return {
    ...file(path, basename, properties),
    tags: tags.map((tag) => ({ tag })),
  };
}

export function linkedFile(
  path: string,
  basename: string,
  links: string[],
  properties: BaseFileInspection["properties"],
): BaseFileInspection {
  return {
    ...file(path, basename, properties),
    links: links.map((link) => ({ resolvedPath: link, targetText: link })),
  };
}

/** Standard 4-file test set used across many tests. */
export function standardInspections(): BaseFileInspection[] {
  return [
    taggedFile(
      "Notes/Alpha.md",
      "Alpha",
      ["#book", "#fiction"],
      [
        { name: "title", value: "Alpha Note" },
        { name: "status", value: "active" },
        { name: "priority", value: 3 },
        { name: "price", value: 9.99 },
        { name: "rating", value: 4.5 },
        { name: "birthday", value: "2000-06-15" },
        { name: "due", value: "2026-08-01" },
        { name: "tags", value: ["book", "fiction"] },
      ],
    ),
    taggedFile(
      "Notes/Bravo.md",
      "Bravo",
      ["#article", "#fiction"],
      [
        { name: "title", value: "Bravo Note" },
        { name: "status", value: "done" },
        { name: "priority", value: 1 },
        { name: "price", value: 24.5 },
        { name: "rating", value: 3.2 },
        { name: "birthday", value: "1995-03-20" },
        { name: "due", value: "2026-01-01" },
        { name: "tags", value: ["article", "fiction"] },
      ],
    ),
    taggedFile(
      "Notes/Charlie.md",
      "Charlie",
      [],
      [
        { name: "title", value: "Charlie Note" },
        { name: "status", value: "active" },
        { name: "priority", value: 5 },
        { name: "price", value: 3 },
        { name: "rating", value: null },
        { name: "birthday", value: null },
        { name: "due", value: null },
        { name: "tags", value: [] },
      ],
    ),
    taggedFile(
      "Notes/Delta.md",
      "Delta",
      ["#book"],
      [
        { name: "title", value: "Delta Note" },
        { name: "status", value: "pending" },
        { name: "priority", value: 2 },
        { name: "price", value: 0 },
        { name: "rating", value: 5 },
        { name: "birthday", value: "2010-12-25" },
        { name: "due", value: "2027-06-30" },
        { name: "tags", value: ["book"] },
      ],
    ),
  ];
}

export function query(
  yaml: string,
  inspections: BaseFileInspection[],
  options?: { view?: string; context?: string },
) {
  const base = parseBase("bases/test.base", yaml);
  return queryBase(base, inspections, options);
}

/** Extract formula value from first row. */
export function f(result: { rows: unknown[] }, name: string): unknown {
  const row = result.rows[0] as Record<string, unknown>;
  return (row?.formulas as Record<string, unknown>)?.[name];
}

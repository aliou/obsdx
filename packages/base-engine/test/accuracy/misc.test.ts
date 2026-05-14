/**
 * t01/t14/t17/t18/t21/t22/t23/t24/t30: Misc verified behaviors
 *
 * Verified: Obsidian 1.12.7
 */

import { describe, expect, it } from "vitest";
import { f, file, query, standardInspections } from "./helpers";

// t01
describe("file.name returns basename without extension", () => {
  it("file.name is the basename, same as file.basename", () => {
    const result = query(
      [
        "views:",
        "  - type: table",
        "    name: FN",
        "    order:",
        "      - file.name",
        "      - file.basename",
      ].join("\n"),
      standardInspections(),
    );
    const row = result.rows[0] as Record<string, unknown>;
    expect((row?.values as Record<string, unknown>)?.["file.name"]).toBe(
      "Alpha",
    );
    expect((row?.values as Record<string, unknown>)?.["file.basename"]).toBe(
      "Alpha",
    );
  });
});

// t14
describe("view sort", () => {
  it("sorts by priority ASC", () => {
    const result = query(
      [
        "views:",
        "  - type: table",
        "    name: S",
        "    sort:",
        "      - property: priority",
        "        direction: ASC",
        "    order:",
        "      - file.name",
        "      - priority",
      ].join("\n"),
      standardInspections(),
    );
    const names = result.rows.map(
      (r) => (r as Record<string, Record<string, unknown>>)?.file?.basename,
    );
    expect(names).toEqual(["Bravo", "Delta", "Alpha", "Charlie"]);
  });
});

// t17
describe("note['property'] bracket access", () => {
  it('note["price"] equals note.price (bracket access)', () => {
    const result = query(
      [
        "formulas:",
        '  B: note["price"]',
        "  D: note.price",
        "views:",
        "  - type: table",
        "    name: Br",
        "    order:",
        "      - file.name",
        "      - formula.B",
        "      - formula.D",
      ].join("\n"),
      [file("Test.md", "Test", [{ name: "price", value: 9.99 }])],
    );
    expect(f(result, "B")).toBe(9.99);
    expect(f(result, "D")).toBe(9.99);
  });
});

// t18
describe("&& and || return booleans", () => {
  it("5 && 3 = true (not short-circuit value)", () => {
    const result = query(
      [
        "formulas:",
        "  A: 5 && 3",
        "views:",
        "  - type: table",
        "    name: L",
        "    order:",
        "      - file.name",
        "      - formula.A",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "A")).toBe(true);
  });

  it("0 || 3 = true", () => {
    const result = query(
      [
        "formulas:",
        "  O: 0 || 3",
        "views:",
        "  - type: table",
        "    name: L",
        "    order:",
        "      - file.name",
        "      - formula.O",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "O")).toBe(true);
  });
});

// t21
describe("property prefix returns null (only 'note' works)", () => {
  it("property.price returns null", () => {
    const result = query(
      [
        "formulas:",
        "  P: property.price",
        "views:",
        "  - type: table",
        "    name: N",
        "    order:",
        "      - file.name",
        "      - formula.P",
      ].join("\n"),
      [file("Test.md", "Test", [{ name: "price", value: 9.99 }])],
    );
    expect(f(result, "P")).toBeNull();
  });

  it("note.price returns the property value", () => {
    const result = query(
      [
        "formulas:",
        "  N: note.price",
        "views:",
        "  - type: table",
        "    name: N",
        "    order:",
        "      - file.name",
        "      - formula.N",
      ].join("\n"),
      [file("Test.md", "Test", [{ name: "price", value: 9.99 }])],
    );
    expect(f(result, "N")).toBe(9.99);
  });
});

// t22
describe("this keyword", () => {
  it("this.file.name is null without context", () => {
    const result = query(
      [
        "formulas:",
        "  T: this.file.name",
        "views:",
        "  - type: table",
        "    name: Th",
        "    order:",
        "      - file.name",
        "      - formula.T",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "T")).toBeNull();
  });

  it("this.file.name resolves to context file when provided", () => {
    const result = query(
      [
        "formulas:",
        "  T: this.file.name",
        "views:",
        "  - type: table",
        "    name: Th",
        "    order:",
        "      - file.name",
        "      - formula.T",
      ].join("\n"),
      [
        file("Notes/Alpha.md", "Alpha", []),
        file("Notes/Embedder.md", "Embedder", []),
      ],
      { context: "Notes/Embedder.md" },
    );
    const alphaRow = result.rows.find(
      (r) =>
        (r as Record<string, Record<string, unknown>>)?.file?.basename ===
        "Alpha",
    );
    expect(
      (alphaRow as Record<string, unknown>) &&
        (
          (alphaRow as Record<string, unknown>).formulas as Record<
            string,
            unknown
          >
        )?.T,
    ).toBe("Embedder");
  });
});

// t23
describe("bare identifiers prefer properties over globals", () => {
  it("bare 'date' resolves to property when it exists", () => {
    const result = query(
      [
        "formulas:",
        "  D: date",
        '  F: date("2023-01-01")',
        "views:",
        "  - type: table",
        "    name: C",
        "    order:",
        "      - file.name",
        "      - formula.D",
        "      - formula.F",
      ].join("\n"),
      [file("Test.md", "Test", [{ name: "date", value: "2025-12-25" }])],
    );
    expect(f(result, "D")).toBe("2025-12-25");
    expect(f(result, "F")).toBeInstanceOf(Date);
  });
});

// t24
describe("render functions", () => {
  it('escapeHTML("<b>bold</b>") returns escaped HTML', () => {
    const result = query(
      [
        "formulas:",
        '  E: escapeHTML("<b>bold</b>")',
        "views:",
        "  - type: table",
        "    name: R",
        "    order:",
        "      - file.name",
        "      - formula.E",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "E")).toBe("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("random() returns a number between 0 and 1", () => {
    const result = query(
      [
        "formulas:",
        "  R: random()",
        "views:",
        "  - type: table",
        "    name: R",
        "    order:",
        "      - file.name",
        "      - formula.R",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    const val = f(result, "R") as number;
    expect(typeof val).toBe("number");
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(1);
  });
});

// t30
describe("file.inFolder() filters by folder", () => {
  it("file.inFolder('Notes') only returns files in Notes/", () => {
    const result = query(
      [
        "filters:",
        "  and:",
        '    - file.inFolder("Notes")',
        "views:",
        "  - type: table",
        "    name: IF",
        "    order:",
        "      - file.name",
      ].join("\n"),
      [
        file("Notes/Alpha.md", "Alpha", []),
        file("Notes/Bravo.md", "Bravo", []),
        file("bases/test.base", "test", []),
      ],
    );
    expect(result.rows).toHaveLength(2);
    const names = result.rows.map(
      (r) => (r as Record<string, Record<string, unknown>>)?.file?.basename,
    );
    expect(names).toContain("Alpha");
    expect(names).toContain("Bravo");
    expect(names).not.toContain("test");
  });
});

/**
 * t08: Any type methods and Object methods
 *
 * Verified: Obsidian 1.12.7
 * - .isTruthy(), .isType(), .toString() work on any value
 * - object.keys(), .values(), .isEmpty() work
 * - (1).isTruthy() works (parens needed to avoid lexer ambiguity with 1.)
 */

import { describe, expect, it } from "vitest";
import { f, file, query } from "./helpers";

describe("any type methods", () => {
  it("(1).isTruthy() = true", () => {
    const result = query(
      [
        "formulas:",
        "  T: (1).isTruthy()",
        "views:",
        "  - type: table",
        "    name: A",
        "    order:",
        "      - file.name",
        "      - formula.T",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "T")).toBe(true);
  });

  it('(42).isType("number") = true', () => {
    const result = query(
      [
        "formulas:",
        '  T: (42).isType("number")',
        "views:",
        "  - type: table",
        "    name: A",
        "    order:",
        "      - file.name",
        "      - formula.T",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "T")).toBe(true);
  });

  it('"hello".isType("string") = true', () => {
    const result = query(
      [
        "formulas:",
        '  T: \'"hello".isType("string")\'',
        "views:",
        "  - type: table",
        "    name: A",
        "    order:",
        "      - file.name",
        "      - formula.T",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "T")).toBe(true);
  });

  it("(123).toString() = '123'", () => {
    const result = query(
      [
        "formulas:",
        "  S: (123).toString()",
        "views:",
        "  - type: table",
        "    name: A",
        "    order:",
        "      - file.name",
        "      - formula.S",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "S")).toBe("123");
  });
});

describe("object methods", () => {
  it("file.properties.keys() returns property name list", () => {
    const result = query(
      [
        "formulas:",
        "  K: file.properties.keys()",
        "views:",
        "  - type: table",
        "    name: O",
        "    order:",
        "      - file.name",
        "      - formula.K",
      ].join("\n"),
      [
        file("A.md", "A", [
          { name: "title", value: "Test" },
          { name: "status", value: "active" },
        ]),
      ],
    );
    const keys = f(result, "K");
    expect(Array.isArray(keys)).toBe(true);
    expect(keys).toContain("title");
    expect(keys).toContain("status");
  });

  it("file.properties.values() returns property values list", () => {
    const result = query(
      [
        "formulas:",
        "  V: file.properties.values()",
        "views:",
        "  - type: table",
        "    name: O",
        "    order:",
        "      - file.name",
        "      - formula.V",
      ].join("\n"),
      [
        file("A.md", "A", [
          { name: "title", value: "Test" },
          { name: "price", value: 9.99 },
        ]),
      ],
    );
    const vals = f(result, "V");
    expect(Array.isArray(vals)).toBe(true);
    expect(vals).toContain("Test");
    expect(vals).toContain(9.99);
  });

  it("file.properties.isEmpty() returns false for non-empty", () => {
    const result = query(
      [
        "formulas:",
        "  E: file.properties.isEmpty()",
        "views:",
        "  - type: table",
        "    name: O",
        "    order:",
        "      - file.name",
        "      - formula.E",
      ].join("\n"),
      [file("A.md", "A", [{ name: "title", value: "Test" }])],
    );
    expect(f(result, "E")).toBe(false);
  });
});

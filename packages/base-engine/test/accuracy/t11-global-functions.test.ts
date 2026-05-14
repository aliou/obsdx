/**
 * t11: Global functions accuracy
 *
 * Verified: Obsidian 1.12.7
 * - min(), max() are variadic globals
 * - number("abc") THROWS error
 * - number("3.14") works, number(true) = 1, number(now()) = ms
 */

import { describe, expect, it } from "vitest";
import { BaseEngineError } from "../../src";
import { f, file, query } from "./helpers";

describe("min() and max()", () => {
  it("min(3, 1, 4) = 1", () => {
    const result = query(
      [
        "formulas:",
        "  M: min(3, 1, 4)",
        "views:",
        "  - type: table",
        "    name: G",
        "    order:",
        "      - file.name",
        "      - formula.M",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "M")).toBe(1);
  });

  it("max(3, 1, 4) = 4", () => {
    const result = query(
      [
        "formulas:",
        "  M: max(3, 1, 4)",
        "views:",
        "  - type: table",
        "    name: G",
        "    order:",
        "      - file.name",
        "      - formula.M",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "M")).toBe(4);
  });
});

describe("number()", () => {
  it('number("3.14") = 3.14', () => {
    const result = query(
      [
        "formulas:",
        '  N: number("3.14")',
        "views:",
        "  - type: table",
        "    name: G",
        "    order:",
        "      - file.name",
        "      - formula.N",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "N")).toBeCloseTo(3.14, 2);
  });

  it('number("abc") throws error', () => {
    const result = query(
      [
        "formulas:",
        '  N: number("abc")',
        "views:",
        "  - type: table",
        "    name: G",
        "    order:",
        "      - file.name",
        "      - formula.N",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    // Obsidian: Error: Unable to parse "abc" as a number.
    expect(f(result, "N")).toBeInstanceOf(BaseEngineError);
  });

  it("number(true) = 1", () => {
    const result = query(
      [
        "formulas:",
        "  N: number(true)",
        "views:",
        "  - type: table",
        "    name: G",
        "    order:",
        "      - file.name",
        "      - formula.N",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "N")).toBe(1);
  });
});

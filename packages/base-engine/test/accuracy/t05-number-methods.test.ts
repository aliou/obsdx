/**
 * t05: Number methods
 *
 * Verified: Obsidian 1.12.7
 * - round() accepts optional digits param: (2.3333).round(2) = 2.33
 * - abs() works: (-5).abs() = 5
 * - floor(), ceil(), toFixed() all work
 */

import { describe, expect, it } from "vitest";
import { f, file, query } from "./helpers";

describe("number.round(digits)", () => {
  it("(2.5).round() rounds to integer 3", () => {
    const result = query(
      [
        "formulas:",
        "  R: (2.5).round()",
        "views:",
        "  - type: table",
        "    name: R",
        "    order:",
        "      - file.name",
        "      - formula.R",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "R")).toBe(3);
  });

  it("(2.3333).round(2) rounds to 2 decimal places", () => {
    const result = query(
      [
        "formulas:",
        "  R: (2.3333).round(2)",
        "views:",
        "  - type: table",
        "    name: R",
        "    order:",
        "      - file.name",
        "      - formula.R",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "R")).toBeCloseTo(2.33, 2);
  });

  it("3.14159.round(4) rounds to 4 decimal places", () => {
    const result = query(
      [
        "formulas:",
        "  R: 3.14159.round(4)",
        "views:",
        "  - type: table",
        "    name: R",
        "    order:",
        "      - file.name",
        "      - formula.R",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "R")).toBeCloseTo(Math.PI, 4);
  });

  it("(2.9).floor() = 2", () => {
    const result = query(
      [
        "formulas:",
        "  F: (2.9).floor()",
        "views:",
        "  - type: table",
        "    name: R",
        "    order:",
        "      - file.name",
        "      - formula.F",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "F")).toBe(2);
  });

  it("(2.1).ceil() = 3", () => {
    const result = query(
      [
        "formulas:",
        "  C: (2.1).ceil()",
        "views:",
        "  - type: table",
        "    name: R",
        "    order:",
        "      - file.name",
        "      - formula.C",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "C")).toBe(3);
  });

  it("(-5).abs() = 5", () => {
    const result = query(
      [
        "formulas:",
        "  A: (-5).abs()",
        "views:",
        "  - type: table",
        "    name: R",
        "    order:",
        "      - file.name",
        "      - formula.A",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "A")).toBe(5);
  });

  it("3.14159.toFixed(2) = '3.14'", () => {
    const result = query(
      [
        "formulas:",
        "  T: 3.14159.toFixed(2)",
        "views:",
        "  - type: table",
        "    name: R",
        "    order:",
        "      - file.name",
        "      - formula.T",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "T")).toBe("3.14");
  });
});

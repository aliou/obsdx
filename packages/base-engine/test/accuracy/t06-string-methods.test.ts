/**
 * t06/t06b/t27: String methods and case sensitivity
 *
 * Verified: Obsidian 1.12.7
 * - .lower(), .title(), .trim(), .startsWith(), .endsWith(), .replace(),
 *   .repeat(), .reverse(), .slice(), .split(), .length all work
 * - string.contains() and list.contains() are CASE-INSENSITIVE
 * - .replace() with string pattern replaces ALL occurrences
 * - list.contains() on tags is # prefix-insensitive
 */

import { describe, expect, it } from "vitest";
import { f, file, query, taggedFile } from "./helpers";

describe("string methods", () => {
  it('"Hello World".lower() = "hello world"', () => {
    const result = query(
      [
        "formulas:",
        "  L: '\"Hello World\".lower()'",
        "views:",
        "  - type: table",
        "    name: S",
        "    order:",
        "      - file.name",
        "      - formula.L",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "L")).toBe("hello world");
  });

  it('"hello world".title() = "Hello World"', () => {
    const result = query(
      [
        "formulas:",
        "  T: '\"hello world\".title()'",
        "views:",
        "  - type: table",
        "    name: S",
        "    order:",
        "      - file.name",
        "      - formula.T",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "T")).toBe("Hello World");
  });

  it('" hi ".trim() = "hi"', () => {
    const result = query(
      [
        "formulas:",
        "  T: '\" hi \".trim()'",
        "views:",
        "  - type: table",
        "    name: S",
        "    order:",
        "      - file.name",
        "      - formula.T",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "T")).toBe("hi");
  });

  it('"hello".startsWith("he") = true', () => {
    const result = query(
      [
        "formulas:",
        '  S: \'"hello".startsWith("he")\'',
        "views:",
        "  - type: table",
        "    name: S",
        "    order:",
        "      - file.name",
        "      - formula.S",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "S")).toBe(true);
  });

  it('"hello".endsWith("lo") = true', () => {
    const result = query(
      [
        "formulas:",
        '  E: \'"hello".endsWith("lo")\'',
        "views:",
        "  - type: table",
        "    name: S",
        "    order:",
        "      - file.name",
        "      - formula.E",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "E")).toBe(true);
  });

  it('"a:b:c:d".replace(":", "-") replaces ALL occurrences', () => {
    const result = query(
      [
        "formulas:",
        '  R: \'"a:b:c:d".replace(":", "-")\'',
        "views:",
        "  - type: table",
        "    name: S",
        "    order:",
        "      - file.name",
        "      - formula.R",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "R")).toBe("a-b-c-d");
  });

  it('"123".repeat(2) = "123123"', () => {
    const result = query(
      [
        "formulas:",
        "  R: '\"123\".repeat(2)'",
        "views:",
        "  - type: table",
        "    name: S",
        "    order:",
        "      - file.name",
        "      - formula.R",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "R")).toBe("123123");
  });

  it('"hello".reverse() = "olleh"', () => {
    const result = query(
      [
        "formulas:",
        "  R: '\"hello\".reverse()'",
        "views:",
        "  - type: table",
        "    name: S",
        "    order:",
        "      - file.name",
        "      - formula.R",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "R")).toBe("olleh");
  });

  it('"hello".slice(1, 4) = "ell"', () => {
    const result = query(
      [
        "formulas:",
        "  S: '\"hello\".slice(1, 4)'",
        "views:",
        "  - type: table",
        "    name: S",
        "    order:",
        "      - file.name",
        "      - formula.S",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "S")).toBe("ell");
  });

  it('"a,b,c,d".split(",") returns list', () => {
    const result = query(
      [
        "formulas:",
        '  S: \'"a,b,c,d".split(",")\'',
        "views:",
        "  - type: table",
        "    name: S",
        "    order:",
        "      - file.name",
        "      - formula.S",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "S")).toEqual(["a", "b", "c", "d"]);
  });

  it('"hello".length = 5', () => {
    const result = query(
      [
        "formulas:",
        "  L: '\"hello\".length'",
        "views:",
        "  - type: table",
        "    name: S",
        "    order:",
        "      - file.name",
        "      - formula.L",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "L")).toBe(5);
  });
});

describe("string.contains() is case-insensitive", () => {
  it('"Hello".contains("ELLO") = true', () => {
    const result = query(
      [
        "formulas:",
        '  C: \'"Hello".contains("ELLO")\'',
        "views:",
        "  - type: table",
        "    name: CI",
        "    order:",
        "      - file.name",
        "      - formula.C",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "C")).toBe(true);
  });

  it('"Hello".contains("hello") = true', () => {
    const result = query(
      [
        "formulas:",
        '  C: \'"Hello".contains("hello")\'',
        "views:",
        "  - type: table",
        "    name: CI",
        "    order:",
        "      - file.name",
        "      - formula.C",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "C")).toBe(true);
  });
});

describe("list.contains() is case-insensitive and # prefix-insensitive", () => {
  it('file.tags.contains("Book") matches "#book" (case-insensitive, #-insensitive)', () => {
    const result = query(
      [
        "formulas:",
        '  H: file.tags.contains("Book")',
        "views:",
        "  - type: table",
        "    name: CI",
        "    order:",
        "      - file.name",
        "      - formula.H",
      ].join("\n"),
      [taggedFile("A.md", "A", ["#book"], [])],
    );
    expect(f(result, "H")).toBe(true);
  });
});

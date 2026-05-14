/**
 * t03/t28/t29: Duration fields and parsing
 *
 * Verified: Obsidian 1.12.7
 * - Date subtraction returns Duration with .days/.hours/.minutes/.seconds/.milliseconds
 * - Also .years and .months
 * - duration() supports: d, w, h, m, M, s, y and named forms
 * - 1M = 31 days, 1y = 365 days (not 30.44 / 365.25)
 * - duration * scalar works: duration("5h") * 2
 */

import { describe, expect, it } from "vitest";
import { f, file, query } from "./helpers";

describe("duration fields on date subtraction", () => {
  it("date subtraction .days returns total days", () => {
    const result = query(
      [
        "formulas:",
        "  AgeDays: (now() - date(birthday)).days",
        "views:",
        "  - type: table",
        "    name: Dur",
        "    order:",
        "      - file.name",
        "      - formula.AgeDays",
      ].join("\n"),
      [file("A.md", "A", [{ name: "birthday", value: "2000-06-15" }])],
    );

    const val = f(result, "AgeDays");
    expect(typeof val).toBe("number");
    expect(val).toBeGreaterThan(9000);
  });

  it("date subtraction .hours returns total hours", () => {
    const result = query(
      [
        "formulas:",
        "  AgeHours: (now() - date(birthday)).hours",
        "views:",
        "  - type: table",
        "    name: Dur",
        "    order:",
        "      - file.name",
        "      - formula.AgeHours",
      ].join("\n"),
      [file("A.md", "A", [{ name: "birthday", value: "2000-06-15" }])],
    );

    expect(typeof f(result, "AgeHours")).toBe("number");
    expect(f(result, "AgeHours")).toBeGreaterThan(200000);
  });

  it("date subtraction .minutes returns total minutes", () => {
    const result = query(
      [
        "formulas:",
        "  AgeMinutes: (now() - date(birthday)).minutes",
        "views:",
        "  - type: table",
        "    name: Dur",
        "    order:",
        "      - file.name",
        "      - formula.AgeMinutes",
      ].join("\n"),
      [file("A.md", "A", [{ name: "birthday", value: "2000-06-15" }])],
    );

    expect(typeof f(result, "AgeMinutes")).toBe("number");
    expect(f(result, "AgeMinutes")).toBeGreaterThan(10000000);
  });

  it("date subtraction .seconds returns total seconds", () => {
    const result = query(
      [
        "formulas:",
        "  AgeSeconds: (now() - date(birthday)).seconds",
        "views:",
        "  - type: table",
        "    name: Dur",
        "    order:",
        "      - file.name",
        "      - formula.AgeSeconds",
      ].join("\n"),
      [file("A.md", "A", [{ name: "birthday", value: "2000-06-15" }])],
    );

    expect(typeof f(result, "AgeSeconds")).toBe("number");
    expect(f(result, "AgeSeconds")).toBeGreaterThan(600000000);
  });

  it("date subtraction .milliseconds returns total ms", () => {
    const result = query(
      [
        "formulas:",
        "  AgeMs: (now() - date(birthday)).milliseconds",
        "views:",
        "  - type: table",
        "    name: Dur",
        "    order:",
        "      - file.name",
        "      - formula.AgeMs",
      ].join("\n"),
      [file("A.md", "A", [{ name: "birthday", value: "2000-06-15" }])],
    );

    expect(typeof f(result, "AgeMs")).toBe("number");
    expect(f(result, "AgeMs")).toBeGreaterThan(600000000000);
  });

  it("null birthday produces null duration", () => {
    const result = query(
      [
        "formulas:",
        "  AgeDays: (now() - date(birthday)).days",
        "views:",
        "  - type: table",
        "    name: Dur",
        "    order:",
        "      - file.name",
        "      - formula.AgeDays",
      ].join("\n"),
      [file("Empty.md", "Empty", [{ name: "birthday", value: null }])],
    );

    expect(f(result, "AgeDays")).toBeNull();
  });
});

describe("duration() parsing", () => {
  it('duration("7d").days = 7', () => {
    const result = query(
      [
        "formulas:",
        '  D: duration("7d").days',
        "views:",
        "  - type: table",
        "    name: Dur",
        "    order:",
        "      - file.name",
        "      - formula.D",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );

    expect(f(result, "D")).toBe(7);
  });

  it('duration("1w").days = 7', () => {
    const result = query(
      [
        "formulas:",
        '  W: duration("1w").days',
        "views:",
        "  - type: table",
        "    name: Dur",
        "    order:",
        "      - file.name",
        "      - formula.W",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );

    expect(f(result, "W")).toBe(7);
  });

  it('duration("1M").days = 31 (not 30.44)', () => {
    const result = query(
      [
        "formulas:",
        '  M: duration("1M").days',
        "views:",
        "  - type: table",
        "    name: Dur",
        "    order:",
        "      - file.name",
        "      - formula.M",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );

    expect(f(result, "M")).toBe(31);
  });

  it('duration("1y").days = 365 (not 365.25)', () => {
    const result = query(
      [
        "formulas:",
        '  Y: duration("1y").days',
        "views:",
        "  - type: table",
        "    name: Dur",
        "    order:",
        "      - file.name",
        "      - formula.Y",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );

    expect(f(result, "Y")).toBe(365);
  });

  it('duration("1h").days = 1/24', () => {
    const result = query(
      [
        "formulas:",
        '  H: duration("1h").days',
        "views:",
        "  - type: table",
        "    name: Dur",
        "    order:",
        "      - file.name",
        "      - formula.H",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );

    expect(f(result, "H")).toBeCloseTo(1 / 24, 10);
  });

  it('duration("1s").days = 1/86400', () => {
    const result = query(
      [
        "formulas:",
        '  S: duration("1s").days',
        "views:",
        "  - type: table",
        "    name: Dur",
        "    order:",
        "      - file.name",
        "      - formula.S",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );

    expect(f(result, "S")).toBeCloseTo(1 / 86400, 10);
  });
});

describe("duration() named unit forms", () => {
  it('duration("1 day").days = 1', () => {
    const result = query(
      [
        "formulas:",
        '  D: duration("1 day").days',
        "views:",
        "  - type: table",
        "    name: N",
        "    order:",
        "      - file.name",
        "      - formula.D",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "D")).toBe(1);
  });

  it('duration("2 days").days = 2', () => {
    const result = query(
      [
        "formulas:",
        '  D: duration("2 days").days',
        "views:",
        "  - type: table",
        "    name: N",
        "    order:",
        "      - file.name",
        "      - formula.D",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "D")).toBe(2);
  });

  it('duration("1 week").days = 7', () => {
    const result = query(
      [
        "formulas:",
        '  W: duration("1 week").days',
        "views:",
        "  - type: table",
        "    name: N",
        "    order:",
        "      - file.name",
        "      - formula.W",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "W")).toBe(7);
  });

  it('duration("1 hour").hours = 1', () => {
    const result = query(
      [
        "formulas:",
        '  H: duration("1 hour").hours',
        "views:",
        "  - type: table",
        "    name: N",
        "    order:",
        "      - file.name",
        "      - formula.H",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "H")).toBe(1);
  });

  it('duration("5 minutes").minutes = 5', () => {
    const result = query(
      [
        "formulas:",
        '  M: duration("5 minutes").minutes',
        "views:",
        "  - type: table",
        "    name: N",
        "    order:",
        "      - file.name",
        "      - formula.M",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "M")).toBe(5);
  });

  it('duration("30 seconds").seconds = 30', () => {
    const result = query(
      [
        "formulas:",
        '  S: duration("30 seconds").seconds',
        "views:",
        "  - type: table",
        "    name: N",
        "    order:",
        "      - file.name",
        "      - formula.S",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "S")).toBeCloseTo(30, 10);
  });

  it('duration("1 month").days = 31', () => {
    const result = query(
      [
        "formulas:",
        '  Mo: duration("1 month").days',
        "views:",
        "  - type: table",
        "    name: N",
        "    order:",
        "      - file.name",
        "      - formula.Mo",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "Mo")).toBe(31);
  });

  it('duration("1 year").days = 365', () => {
    const result = query(
      [
        "formulas:",
        '  Y: duration("1 year").days',
        "views:",
        "  - type: table",
        "    name: N",
        "    order:",
        "      - file.name",
        "      - formula.Y",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "Y")).toBe(365);
  });
});

describe("duration * scalar", () => {
  it('duration("5h") * 2 has .hours = 10', () => {
    const result = query(
      [
        "formulas:",
        '  D: (duration("5h") * 2).hours',
        "views:",
        "  - type: table",
        "    name: Dur",
        "    order:",
        "      - file.name",
        "      - formula.D",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );

    expect(f(result, "D")).toBe(10);
  });
});

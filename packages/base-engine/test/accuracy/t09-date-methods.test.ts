/**
 * t09: Date methods
 *
 * Verified: Obsidian 1.12.7
 * - .date() strips time, .time() returns time string, .relative() returns relative time
 * - .isEmpty() = false for dates
 * - .hour, .minute, .second, .millisecond fields
 * - .year, .month, .day fields (already implemented)
 * - .format() supports Moment.js patterns (dddd, MMMM, Do, MMM, etc.)
 */

import { describe, expect, it } from "vitest";
import { f, file, query } from "./helpers";

describe("date methods", () => {
  it("now().date() strips time portion", () => {
    const result = query(
      [
        "formulas:",
        "  D: now().date()",
        "views:",
        "  - type: table",
        "    name: D",
        "    order:",
        "      - file.name",
        "      - formula.D",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    const val = f(result, "D") as Date;
    expect(val).toBeInstanceOf(Date);
    expect(val.getHours()).toBe(0);
    expect(val.getMinutes()).toBe(0);
    expect(val.getSeconds()).toBe(0);
  });

  it("now().time() returns time string HH:MM:SS", () => {
    const result = query(
      [
        "formulas:",
        "  T: now().time()",
        "views:",
        "  - type: table",
        "    name: D",
        "    order:",
        "      - file.name",
        "      - formula.T",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "T")).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("file.mtime.relative() returns relative time string", () => {
    const now = new Date();
    const result = query(
      [
        "formulas:",
        "  R: file.mtime.relative()",
        "views:",
        "  - type: table",
        "    name: D",
        "    order:",
        "      - file.name",
        "      - formula.R",
      ].join("\n"),
      [
        file("Test.md", "Test", [], {
          file: {
            path: "Test.md",
            name: "Test.md",
            basename: "Test",
            ext: ".md",
            folder: "",
            kind: "markdown",
            mtime: now.toISOString(),
          },
        }),
      ],
    );
    const val = f(result, "R");
    expect(typeof val).toBe("string");
    expect(val.length).toBeGreaterThan(0);
  });

  it("now().isEmpty() = false", () => {
    const result = query(
      [
        "formulas:",
        "  E: now().isEmpty()",
        "views:",
        "  - type: table",
        "    name: D",
        "    order:",
        "      - file.name",
        "      - formula.E",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "E")).toBe(false);
  });

  it("now().hour returns numeric hour", () => {
    const result = query(
      [
        "formulas:",
        "  H: now().hour",
        "views:",
        "  - type: table",
        "    name: D",
        "    order:",
        "      - file.name",
        "      - formula.H",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    const val = f(result, "H") as number;
    expect(typeof val).toBe("number");
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(23);
  });

  it("now().minute returns numeric minute", () => {
    const result = query(
      [
        "formulas:",
        "  M: now().minute",
        "views:",
        "  - type: table",
        "    name: D",
        "    order:",
        "      - file.name",
        "      - formula.M",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    const val = f(result, "M") as number;
    expect(typeof val).toBe("number");
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(59);
  });

  it("date(...).year returns year", () => {
    const result = query(
      [
        "formulas:",
        '  Y: date("2023-09-12").year',
        "views:",
        "  - type: table",
        "    name: D",
        "    order:",
        "      - file.name",
        "      - formula.Y",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "Y")).toBe(2023);
  });

  it("date(...).month returns month (1-12)", () => {
    const result = query(
      [
        "formulas:",
        '  M: date("2023-09-12").month',
        "views:",
        "  - type: table",
        "    name: D",
        "    order:",
        "      - file.name",
        "      - formula.M",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "M")).toBe(9);
  });

  it("date(...).day returns day", () => {
    const result = query(
      [
        "formulas:",
        '  D: date("2023-09-12").day',
        "views:",
        "  - type: table",
        "    name: D",
        "    order:",
        "      - file.name",
        "      - formula.D",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "D")).toBe(12);
  });
});

describe("date.format() Moment.js patterns", () => {
  it('"dddd" returns day name', () => {
    const result = query(
      [
        "formulas:",
        '  D: date("2023-09-12 14:30:05").format("dddd")',
        "views:",
        "  - type: table",
        "    name: F",
        "    order:",
        "      - file.name",
        "      - formula.D",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "D")).toBe("Tuesday");
  });

  it('"MMM" returns abbreviated month', () => {
    const result = query(
      [
        "formulas:",
        '  M: date("2023-09-12 14:30:05").format("MMM")',
        "views:",
        "  - type: table",
        "    name: F",
        "    order:",
        "      - file.name",
        "      - formula.M",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "M")).toBe("Sep");
  });

  it('"dddd, MMMM Do, YYYY" returns full format', () => {
    const result = query(
      [
        "formulas:",
        '  F: date("2023-09-12 14:30:05").format("dddd, MMMM Do, YYYY")',
        "views:",
        "  - type: table",
        "    name: F",
        "    order:",
        "      - file.name",
        "      - formula.F",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "F")).toBe("Tuesday, September 12th, 2023");
  });
});

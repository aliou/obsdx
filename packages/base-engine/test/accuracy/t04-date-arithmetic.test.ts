/**
 * t04: Date arithmetic with duration strings
 *
 * Verified: Obsidian 1.12.7
 * date + "1d"/"1w"/"1M"/"1y"/"1h"/"1 day" all work.
 * 1M = calendar month, 1y = calendar year for date arithmetic.
 * Complex chaining works: date + "1M" + "4h" + "3m".
 */

import { describe, expect, it } from "vitest";
import { f, file, query } from "./helpers";

function localDate(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function localDateTime(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${localDate(value)}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

describe("date + duration string", () => {
  it('date + "1d" adds one day', () => {
    const result = query(
      [
        "formulas:",
        '  P: date("2023-09-12") + "1d"',
        "views:",
        "  - type: table",
        "    name: A",
        "    order:",
        "      - file.name",
        "      - formula.P",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    const val = f(result, "P");
    expect(val).toBeInstanceOf(Date);
    expect(localDate(val as Date)).toBe("2023-09-13");
  });

  it('date + "1w" adds 7 days', () => {
    const result = query(
      [
        "formulas:",
        '  P: date("2023-09-12") + "1w"',
        "views:",
        "  - type: table",
        "    name: A",
        "    order:",
        "      - file.name",
        "      - formula.P",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    const val = f(result, "P");
    expect(val).toBeInstanceOf(Date);
    expect(localDate(val as Date)).toBe("2023-09-19");
  });

  it('date + "1M" adds one calendar month', () => {
    const result = query(
      [
        "formulas:",
        '  P: date("2024-01-31") + "1M"',
        "views:",
        "  - type: table",
        "    name: A",
        "    order:",
        "      - file.name",
        "      - formula.P",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    const val = f(result, "P");
    expect(val).toBeInstanceOf(Date);
    expect(localDate(val as Date)).toBe("2024-03-02");
  });

  it('date + "1y" adds one calendar year', () => {
    const result = query(
      [
        "formulas:",
        '  P: date("2024-01-01") + "1y"',
        "views:",
        "  - type: table",
        "    name: A",
        "    order:",
        "      - file.name",
        "      - formula.P",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    const val = f(result, "P");
    expect(val).toBeInstanceOf(Date);
    expect(localDate(val as Date)).toBe("2025-01-01");
  });

  it('date + "1h" adds one hour', () => {
    const result = query(
      [
        "formulas:",
        '  P: date("2023-09-12") + "1h"',
        "views:",
        "  - type: table",
        "    name: A",
        "    order:",
        "      - file.name",
        "      - formula.P",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    const val = f(result, "P");
    expect(val).toBeInstanceOf(Date);
    expect(localDateTime(val as Date)).toBe("2023-09-12T01:00:00");
  });

  it('date + "1 day" (named form) adds one day', () => {
    const result = query(
      [
        "formulas:",
        '  P: date("2023-09-12") + "1 day"',
        "views:",
        "  - type: table",
        "    name: A",
        "    order:",
        "      - file.name",
        "      - formula.P",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    const val = f(result, "P");
    expect(val).toBeInstanceOf(Date);
    expect(localDate(val as Date)).toBe("2023-09-13");
  });

  it('complex chaining: date + "1M" + "4h" + "3m"', () => {
    const result = query(
      [
        "formulas:",
        '  P: date("2024-12-01") + "1M" + "4h" + "3m"',
        "views:",
        "  - type: table",
        "    name: A",
        "    order:",
        "      - file.name",
        "      - formula.P",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    const val = f(result, "P");
    expect(val).toBeInstanceOf(Date);
    expect(localDateTime(val as Date)).toBe("2025-01-01T04:03:00");
  });
});

/**
 * t02: today() vs now()
 *
 * Verified: Obsidian 1.12.7
 * today() returns date with time=00:00:00, now() returns current datetime.
 */

import { describe, expect, it } from "vitest";
import { f, file, query } from "./helpers";

describe("today() vs now()", () => {
  it("today().hour should be 0 (midnight)", () => {
    const result = query(
      [
        "formulas:",
        "  TodayHour: today().hour",
        "  NowHour: now().hour",
        "views:",
        "  - type: table",
        "    name: Time",
        "    order:",
        "      - file.name",
        "      - formula.TodayHour",
        "      - formula.NowHour",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );

    expect(f(result, "TodayHour")).toBe(0);
    expect(f(result, "NowHour")).toBeGreaterThanOrEqual(0);
  });

  it("(now() - today()).hours should be positive", () => {
    const result = query(
      [
        "formulas:",
        "  Diff: (now() - today()).hours",
        "views:",
        "  - type: table",
        "    name: Time",
        "    order:",
        "      - file.name",
        "      - formula.Diff",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );

    expect(f(result, "Diff")).toBeGreaterThanOrEqual(0);
  });
});

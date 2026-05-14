/**
 * t10: Link functions
 *
 * Verified: Obsidian 1.12.7
 * - link() supports optional display parameter: link("Alpha", "Go to Alpha") = [[Alpha|Go to Alpha]]
 * - file.asLink() returns wikilink (with path in Obsidian)
 * - link("[[Alpha]]").asFile() resolves to file object
 */

import { describe, expect, it } from "vitest";
import { f, file, linkedFile, query } from "./helpers";

describe("link()", () => {
  it('link("Alpha") returns wikilink', () => {
    const result = query(
      [
        "formulas:",
        '  L: link("Alpha")',
        "views:",
        "  - type: table",
        "    name: L",
        "    order:",
        "      - file.name",
        "      - formula.L",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "L")).toBe("[[Alpha]]");
  });

  it('link("Alpha", "Go to Alpha") supports display text', () => {
    const result = query(
      [
        "formulas:",
        '  L: link("Alpha", "Go to Alpha")',
        "views:",
        "  - type: table",
        "    name: L",
        "    order:",
        "      - file.name",
        "      - formula.L",
      ].join("\n"),
      [file("Test.md", "Test", [])],
    );
    expect(f(result, "L")).toBe("[[Alpha|Go to Alpha]]");
  });
});

describe("file.asLink()", () => {
  it("returns wikilink string", () => {
    const result = query(
      [
        "formulas:",
        "  A: file.asLink()",
        "views:",
        "  - type: table",
        "    name: L",
        "    order:",
        "      - file.name",
        "      - formula.A",
      ].join("\n"),
      [file("Notes/Alpha.md", "Alpha", [])],
    );
    const val = f(result, "A");
    expect(typeof val).toBe("string");
    expect(val).toMatch(/^\[\[.*\]\]$/);
  });
});

describe("link.asFile()", () => {
  it('link("[[Alpha]]").asFile() resolves to a file', () => {
    const inspections = [
      linkedFile("Notes/Alpha.md", "Alpha", [], []),
      file("Notes/Other.md", "Other", []),
    ];
    const result = query(
      [
        "formulas:",
        '  A: link("[[Alpha]]").asFile()',
        "views:",
        "  - type: table",
        "    name: L",
        "    order:",
        "      - file.name",
        "      - formula.A",
      ].join("\n"),
      inspections,
    );
    const val = f(result, "A");
    expect(val).not.toBeNull();
  });
});

import { describe, expect, test } from "vitest";
import { parseMarkdownLinks } from "../src/markdown/markdown-links";
import { parseMarkdown } from "../src/markdown/parser";
import { parseWikilinks } from "../src/markdown/wikilinks";

// ---------------------------------------------------------------------------
// Fenced code block exclusion
// ---------------------------------------------------------------------------
// Content inside fenced code blocks (``` ... ```) is not markdown — it is
// literal text. Double brackets like [[0, 3]] inside a code block are
// JavaScript array-of-arrays literals, not Obsidian wikilinks.  Obsidian
// itself does not render them as links.  The parsers must skip code-block
// content to avoid false positives.
// ---------------------------------------------------------------------------

describe("parseWikilinks: ignores content inside fenced code blocks", () => {
  test("does not parse [[0, 3]] inside a ```typescript fenced block", () => {
    const source = [
      "# Example",
      "",
      "```typescript",
      "// Fuse.js returns: indices: [[0, 3]]",
      "```",
      "",
      "See [[RealLink]] for details.",
    ].join("\n");

    const wikilinks = parseWikilinks(source, lineOffsets(source));

    expect(wikilinks).toHaveLength(1);
    expect(wikilinks[0]?.raw).toBe("[[RealLink]]");
    expect(wikilinks[0]?.targetText).toBe("RealLink");
  });

  test("does not parse [[item]] inside an indented code block (4 spaces)", () => {
    // Obsidian itself treats 4-space-indented lines as code blocks in
    // reading mode, so [[item]] inside them should not be linked.
    const source = [
      "# Notes",
      "",
      "    const x = [[item]];",
      "",
      "Link to [[Target]].",
    ].join("\n");

    const wikilinks = parseWikilinks(source, lineOffsets(source));

    expect(wikilinks).toHaveLength(1);
    expect(wikilinks[0]?.raw).toBe("[[Target]]");
  });

  test("does not parse a wikilink inside a tilde-fenced block (~~~)", () => {
    const source = ["~~~", "Result: [[nested]]", "~~~", "", "[[Outside]]"].join(
      "\n",
    );

    const wikilinks = parseWikilinks(source, lineOffsets(source));

    expect(wikilinks).toHaveLength(1);
    expect(wikilinks[0]?.raw).toBe("[[Outside]]");
  });

  test("does not parse wikilinks across multiple lines in a code block", () => {
    const source = [
      "```json",
      '{ "data": [[1, 2], [3, 4]] }',
      "```",
      "",
      "[[Legit]]",
    ].join("\n");

    const wikilinks = parseWikilinks(source, lineOffsets(source));

    expect(wikilinks).toHaveLength(1);
    expect(wikilinks[0]?.targetText).toBe("Legit");
  });

  test("does not parse wikilinks inside inline code (single backtick)", () => {
    const source = "Use `const arr = [[1, 2]]` only. See [[RealTarget]].";

    const wikilinks = parseWikilinks(source, lineOffsets(source));

    expect(wikilinks).toHaveLength(1);
    expect(wikilinks[0]?.raw).toBe("[[RealTarget]]");
  });
});

describe("parseMarkdownLinks: ignores content inside fenced code blocks", () => {
  test("does not parse [text](url) inside a fenced code block", () => {
    const source = [
      "```markdown",
      "[Inside Block](https://example.com)",
      "```",
      "",
      "[Outside](https://real.com)",
    ].join("\n");

    const links = parseMarkdownLinks(source, lineOffsets(source));

    expect(links).toHaveLength(1);
    expect(links[0]?.target).toBe("https://real.com");
  });
});

describe("parseMarkdown: ignores wikilinks inside fenced code blocks (end-to-end)", () => {
  test("parseMarkdown strips code-block content before extracting wikilinks", () => {
    const source = [
      "---",
      "title: Test",
      "---",
      "",
      "```typescript",
      "// indices: [[0, 3]]",
      "```",
      "",
      "See [[WorkingLink]] for more.",
    ].join("\n");

    const result = parseMarkdown(source);

    expect(result.wikilinks).toHaveLength(1);
    expect(result.wikilinks[0]?.raw).toBe("[[WorkingLink]]");
    expect(result.wikilinks[0]?.targetText).toBe("WorkingLink");
  });

  test("parseMarkdown preserves a wikilink that appears both inside and outside code blocks (only the outside one)", () => {
    const source = [
      "```",
      "[[Ambiguous]]",
      "```",
      "",
      "Link to [[Ambiguous]].",
    ].join("\n");

    const result = parseMarkdown(source);

    expect(result.wikilinks).toHaveLength(1);
    expect(result.wikilinks[0]?.targetText).toBe("Ambiguous");
  });
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function lineOffsets(source: string): number[] {
  const offsets = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

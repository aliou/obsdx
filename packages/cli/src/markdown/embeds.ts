import type { MarkdownLink } from "./markdown-links";
import type { Wikilink } from "./wikilinks";

export type Embed = {
  raw: string;
  targetText: string;
  line?: number;
  column?: number;
};

export function parseEmbeds(
  wikilinks: Wikilink[],
  markdownLinks: MarkdownLink[],
): Embed[] {
  return [
    ...wikilinks
      .filter((link) => link.embedded)
      .map((link) => ({
        raw: link.raw,
        targetText: link.targetText,
        line: link.line,
        column: link.column,
      })),
    ...markdownLinks
      .filter((link) => link.embedded)
      .map((link) => ({
        raw: link.raw,
        targetText: link.target,
        line: link.line,
        column: link.column,
      })),
  ];
}

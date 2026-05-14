import type { BlockReference } from "./blocks";
import { parseBlockReferences } from "./blocks";
import type { Embed } from "./embeds";
import { parseEmbeds } from "./embeds";
import { parseFrontmatter } from "./frontmatter";
import type { Heading } from "./headings";
import { parseHeadings } from "./headings";
import type { MarkdownLink } from "./markdown-links";
import { parseMarkdownLinks } from "./markdown-links";
import { normalizeProperties } from "./properties";
import type { Tag } from "./tags";
import { parseTags } from "./tags";
import type { Wikilink } from "./wikilinks";
import { parseWikilinks } from "./wikilinks";

export type MarkdownParseResult = {
  frontmatter: Record<string, unknown> | null;
  body: string;
  bodyStartLine: number;
  frontmatterError?: string;
  properties: Record<string, unknown>;
  propertyValueTypes: Record<string, string>;
  tags: Tag[];
  wikilinks: Wikilink[];
  markdownLinks: MarkdownLink[];
  embeds: Embed[];
  headings: Heading[];
  blocks: BlockReference[];
};

export function parseMarkdown(
  source: string,
  propertyTypes: Record<string, string> = {},
): MarkdownParseResult {
  const frontmatter = parseFrontmatter(source);
  const properties = normalizeProperties(
    frontmatter.value ?? {},
    propertyTypes,
  );
  const lineOffsets = buildLineOffsets(source);
  const wikilinks = parseWikilinks(source, lineOffsets);
  const markdownLinks = parseMarkdownLinks(source, lineOffsets);

  return {
    frontmatter: frontmatter.value,
    body: frontmatter.body,
    bodyStartLine: frontmatter.bodyStartLine,
    frontmatterError: frontmatter.error,
    properties: properties.values,
    propertyValueTypes: properties.valueTypes,
    tags: parseTags(source, frontmatter.value),
    wikilinks,
    markdownLinks,
    embeds: parseEmbeds(wikilinks, markdownLinks),
    headings: parseHeadings(frontmatter.body, frontmatter.bodyStartLine),
    blocks: parseBlockReferences(frontmatter.body, frontmatter.bodyStartLine),
  };
}

export function buildLineOffsets(source: string): number[] {
  const offsets = [0];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      offsets.push(index + 1);
    }
  }

  return offsets;
}

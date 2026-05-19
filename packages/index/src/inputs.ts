import type { BaseDefinition } from "@aliou/obsdx-base-ast";
import type {
  CachedBlock,
  CachedHeading,
  CachedProperty,
  CachedTag,
} from "./model";

export type IndexedLinkInput = {
  raw: string;
  kind: "wikilink" | "markdown";
  embedded: boolean;
  targetText: string;
  targetPathText: string | null;
  heading: string | null;
  blockId: string | null;
  display: string | null;
  line: number | null;
  column: number | null;
};

export type MarkdownIndexInput = {
  frontmatter: Record<string, unknown> | null;
  body: string;
  bodyStartLine: number;
  parseError: string | null;
  properties: CachedProperty[];
  tags: CachedTag[];
  links: IndexedLinkInput[];
  headings: CachedHeading[];
  blocks: CachedBlock[];
};

export type BaseIndexInput = {
  definition: BaseDefinition | null;
  parseError: string | null;
};

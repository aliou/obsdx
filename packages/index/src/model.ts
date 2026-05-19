import type { BaseDefinition } from "@aliou/obsdx-base-ast";
import type { CachedVaultFile } from "./files";

export type CachedProperty = {
  name: string;
  value: unknown;
  valueType: string;
};

export type CachedTag = {
  tag: string;
  source: string;
  line: number | null;
};

export type CachedLink = {
  sourcePath: string | null;
  raw: string;
  kind: string;
  embedded: boolean;
  targetText: string;
  targetPathText: string | null;
  heading: string | null;
  blockId: string | null;
  display: string | null;
  resolvedPath: string | null;
  unresolved: boolean;
  ambiguousPaths: string[];
  line: number | null;
  column: number | null;
};

export type CachedHeading = {
  level: number;
  text: string;
  slug: string;
  line: number;
};

export type CachedBlock = {
  blockId: string;
  line: number;
};

export type CachedMarkdown = {
  frontmatter: Record<string, unknown> | null;
  body: string;
  bodyStartLine: number;
};

export type CachedBase = {
  path: string;
  definition: BaseDefinition | null;
  parseError: string | null;
  parsedAt: string;
};

export type FileInspection = {
  file: CachedVaultFile;
  markdown: CachedMarkdown | null;
  properties: CachedProperty[];
  tags: CachedTag[];
  links: CachedLink[];
  backlinks: CachedLink[];
  embeds: CachedLink[];
  headings: CachedHeading[];
  blocks: CachedBlock[];
  parseErrors: string[];
};

export type TagCount = {
  tag: string;
  count: number;
};

export type TagTreeNode = {
  tag: string;
  fullTag: string;
  count: number;
  children: TagTreeNode[];
};

export type PropertyCount = {
  name: string;
  count: number;
};

export type TaggedFile = {
  file: CachedVaultFile;
  tag: CachedTag;
};

export function buildTagTree(tags: TagCount[]): TagTreeNode[] {
  const root: TagTreeNode[] = [];
  const nodeMap = new Map<string, TagTreeNode>();

  for (const { tag, count } of tags) {
    const node: TagTreeNode = { tag, fullTag: tag, count, children: [] };
    nodeMap.set(tag, node);
  }

  for (const { tag } of tags) {
    const node = nodeMap.get(tag);
    if (!node) continue;

    const slashIndex = tag.lastIndexOf("/");
    if (slashIndex === -1) {
      root.push(node);
    } else {
      const parentTag = tag.slice(0, slashIndex);
      const parent = nodeMap.get(parentTag);
      if (parent) {
        parent.children.push(node);
      } else {
        root.push(node);
      }
    }
  }

  return root;
}

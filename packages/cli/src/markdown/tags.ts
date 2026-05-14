export type Tag = {
  tag: string;
  source: "frontmatter" | "inline";
  line?: number;
};

export function parseTags(
  source: string,
  frontmatter: Record<string, unknown> | null,
): Tag[] {
  const tags = new Map<string, Tag>();

  for (const tag of frontmatterTags(frontmatter)) {
    tags.set(`frontmatter:${tag}`, {
      tag,
      source: "frontmatter",
    });
  }

  for (const tag of inlineTags(source)) {
    tags.set(`inline:${tag.tag}:${tag.line}`, tag);
  }

  return [...tags.values()];
}

function frontmatterTags(
  frontmatter: Record<string, unknown> | null,
): string[] {
  if (!frontmatter) {
    return [];
  }

  return normalizeTagValue(frontmatter.tags);
}

function normalizeTagValue(value: unknown): string[] {
  if (typeof value === "string") {
    return [normalizeTag(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeTagValue(item));
  }

  return [];
}

function inlineTags(source: string): Tag[] {
  const tags: Tag[] = [];
  // Strip wikilinks first so [[#heading]] does not produce a
  // spurious inline tag. Must happen before stripCodeFences so
  // the link text inside code fences is also removed.
  const withoutWikilinks = source.replace(/!?\[\[[^\]]+\]\]/g, "");
  const lines = stripCodeFences(withoutWikilinks).split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const withoutInlineCode = line.replace(/`[^`]*`/g, "");
    const matches = withoutInlineCode.matchAll(
      /(^|[\s([{>])#([A-Za-z0-9][A-Za-z0-9/_-]*)(?=$|[\s.,;:!?()[\]{}])/g,
    );

    for (const match of matches) {
      if (!match[2]) {
        continue;
      }

      tags.push({
        tag: normalizeTag(match[2]),
        source: "inline",
        line: index + 1,
      });
    }
  }

  return tags;
}

function stripCodeFences(source: string): string {
  return source.replace(/```[\s\S]*?```/g, "");
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, "");
}

import { maskMarkdownCode } from "./code-mask";

export type Wikilink = {
  raw: string;
  embedded: boolean;
  targetText: string;
  heading?: string;
  blockId?: string;
  display?: string;
  line?: number;
  column?: number;
};

export function parseWikilinks(
  source: string,
  lineOffsets: number[],
): Wikilink[] {
  const links: Wikilink[] = [];
  const matches = maskMarkdownCode(source).matchAll(/!?\[\[([^\]]+)\]\]/g);

  for (const match of matches) {
    const raw = match[0];
    const inner = match[1];
    const index = match.index ?? 0;

    if (!inner) {
      continue;
    }

    links.push({
      raw,
      embedded: raw.startsWith("!"),
      ...parseWikilinkTarget(inner),
      ...lineColumn(index, lineOffsets),
    });
  }

  return links;
}

function parseWikilinkTarget(
  inner: string,
): Pick<Wikilink, "targetText" | "heading" | "blockId" | "display"> {
  const pipeIndex = inner.indexOf("|");
  const targetPart = pipeIndex === -1 ? inner : inner.slice(0, pipeIndex);
  const display = pipeIndex === -1 ? undefined : inner.slice(pipeIndex + 1);
  const hashIndex = targetPart.indexOf("#");
  const pathPart =
    hashIndex === -1 ? targetPart : targetPart.slice(0, hashIndex);
  const fragment =
    hashIndex === -1 ? undefined : targetPart.slice(hashIndex + 1);
  const result: Pick<
    Wikilink,
    "targetText" | "heading" | "blockId" | "display"
  > = {
    targetText: pathPart,
  };

  if (fragment?.startsWith("^")) {
    result.blockId = fragment.slice(1);
  } else if (fragment) {
    result.heading = fragment;
  }

  if (display) {
    result.display = display;
  }

  return result;
}

function lineColumn(
  index: number,
  lineOffsets: number[],
): { line: number; column: number } {
  let lineIndex = 0;

  for (const [currentIndex, offset] of lineOffsets.entries()) {
    if (offset > index) {
      break;
    }
    lineIndex = currentIndex;
  }

  return {
    line: lineIndex + 1,
    column: index - (lineOffsets[lineIndex] ?? 0) + 1,
  };
}

import { maskMarkdownCode } from "./code-mask";

export type MarkdownLink = {
  raw: string;
  embedded: boolean;
  label: string;
  target: string;
  line?: number;
  column?: number;
};

export function parseMarkdownLinks(
  source: string,
  lineOffsets: number[],
): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const matches = maskMarkdownCode(source).matchAll(
    /!?\[([^\]]*)\]\(([^)]+)\)/g,
  );

  for (const match of matches) {
    const raw = match[0];
    const index = match.index ?? 0;

    links.push({
      raw,
      embedded: raw.startsWith("!"),
      label: match[1] ?? "",
      target: match[2] ?? "",
      ...lineColumn(index, lineOffsets),
    });
  }

  return links;
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

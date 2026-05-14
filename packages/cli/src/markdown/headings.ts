export type Heading = {
  level: number;
  text: string;
  slug: string;
  line: number;
};

export function parseHeadings(body: string, bodyStartLine: number): Heading[] {
  const headings: Heading[] = [];
  const lines = body.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) {
      continue;
    }

    const text = match[2]?.trim() ?? "";
    headings.push({
      level: match[1]?.length ?? 1,
      text,
      slug: slugHeading(text),
      line: bodyStartLine + index,
    });
  }

  return headings;
}

export function slugHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

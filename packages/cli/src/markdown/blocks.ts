export type BlockReference = {
  blockId: string;
  line: number;
};

export function parseBlockReferences(
  body: string,
  bodyStartLine: number,
): BlockReference[] {
  const blocks: BlockReference[] = [];
  const lines = body.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const match = /(?:^|\s)\^([A-Za-z0-9-]+)\s*$/.exec(line);
    if (!match?.[1]) {
      continue;
    }

    blocks.push({
      blockId: match[1],
      line: bodyStartLine + index,
    });
  }

  return blocks;
}

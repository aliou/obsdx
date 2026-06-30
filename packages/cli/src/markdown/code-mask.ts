export function maskMarkdownCode(source: string): string {
  return maskInlineCode(maskBlockCode(source));
}

function maskBlockCode(source: string): string {
  const lines = source.match(/.*(?:\r\n|\n|\r|$)/g) ?? [];
  const output: string[] = [];
  let inFence: { marker: "`" | "~"; length: number } | null = null;

  for (const line of lines) {
    if (line.length === 0) {
      continue;
    }

    const content = line.replace(/\r?\n$|\r$/, "");
    const fence = content.match(/^ {0,3}(`{3,}|~{3,})/);

    if (inFence) {
      output.push(maskPreservingLineEndings(line));

      if (
        fence?.[1]?.startsWith(inFence.marker) &&
        fence[1].length >= inFence.length
      ) {
        inFence = null;
      }

      continue;
    }

    if (fence) {
      const marker = fence[1]?.[0];
      if (marker === "`" || marker === "~") {
        inFence = { marker, length: fence[1]?.length ?? 3 };
        output.push(maskPreservingLineEndings(line));
        continue;
      }
    }

    if (/^(?: {4}|\t)/.test(content)) {
      output.push(maskPreservingLineEndings(line));
      continue;
    }

    output.push(line);
  }

  return output.join("");
}

function maskInlineCode(source: string): string {
  let output = "";

  for (let index = 0; index < source.length; ) {
    if (source[index] !== "`") {
      output += source[index];
      index += 1;
      continue;
    }

    const runStart = index;
    while (source[index] === "`") {
      index += 1;
    }

    const tickCount = index - runStart;
    const closingIndex = source.indexOf("`".repeat(tickCount), index);

    if (closingIndex === -1) {
      output += source.slice(runStart, index);
      continue;
    }

    output += maskPreservingLineEndings(
      source.slice(runStart, closingIndex + tickCount),
    );
    index = closingIndex + tickCount;
  }

  return output;
}

function maskPreservingLineEndings(value: string): string {
  return value.replace(/[^\r\n]/g, " ");
}

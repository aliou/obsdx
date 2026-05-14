import type { GlobalOptions } from "./main";

export function writeJson(
  value: unknown,
  options: Pick<GlobalOptions, "pretty">,
): void {
  const spacing = options.pretty ? 2 : 0;
  process.stdout.write(`${JSON.stringify(value, null, spacing)}\n`);
}

export function writeHuman(
  message: string,
  options: Pick<GlobalOptions, "quiet">,
): void {
  if (options.quiet) {
    return;
  }

  process.stdout.write(`${message}\n`);
}

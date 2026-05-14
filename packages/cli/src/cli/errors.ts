import { BaseEngineError } from "@aliou/obsdx-base-engine";
import type { GlobalOptions } from "./main";

export class ObsdxError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ObsdxError";
  }
}

export function handleCliError(
  error: unknown,
  options: Pick<GlobalOptions, "json" | "pretty">,
): never {
  const normalized = mapError(error);

  if (options.json) {
    const spacing = options.pretty ? 2 : 0;
    process.stderr.write(
      `${JSON.stringify(
        {
          error: {
            code: normalized.code,
            message: normalized.message,
            details: normalized.details,
          },
        },
        null,
        spacing,
      )}\n`,
    );
  } else {
    process.stderr.write(`${normalized.code}: ${normalized.message}\n`);
  }

  process.exit(1);
}

function mapError(error: unknown): ObsdxError {
  if (error instanceof ObsdxError) {
    return error;
  }

  if (error instanceof BaseEngineError) {
    return new ObsdxError(error.code, error.message, error.details);
  }

  return new ObsdxError(
    "INTERNAL_ERROR",
    error instanceof Error ? error.message : String(error),
  );
}

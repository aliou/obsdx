import { command, positional, string } from "@drizzle-team/brocli";
import {
  inspectIndexedBase,
  listIndexedBases,
  queryIndexedBase,
  renderIndexedBaseEmbeds,
  validateIndexedBase,
} from "../../vault/indexer";
import { resolveVaultFromOptions } from "../context";
import { ObsdxError } from "../errors";
import { getGlobalOptions } from "../main";
import { writeHuman, writeJson } from "../output";

export const baseCommand = command({
  name: "base",
  desc: "Inspect and query Obsidian Bases",
  subcommands: [
    command({
      name: "list",
      desc: "List base files",
      handler: async () => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const bases = await listIndexedBases(vault);

        if (options.json) {
          writeJson({ bases }, options);
          return;
        }

        for (const base of bases) {
          writeHuman(base.path, options);
        }
      },
    }),
    command({
      name: "inspect",
      desc: "Inspect a base file",
      options: {
        path: positional("path").desc("Vault-relative base path").required(),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const base = await inspectIndexedBase(vault, commandOptions.path);

        if (!base) {
          throw baseNotFound(commandOptions.path);
        }

        if (options.json) {
          writeJson({ base }, options);
          return;
        }

        writeHuman(`${base.path}: ${base.views.length} views`, options);
      },
    }),
    command({
      name: "validate",
      desc: "Validate a base file",
      options: {
        path: positional("path").desc("Vault-relative base path").required(),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const result = await validateIndexedBase(vault, commandOptions.path);

        if (!result) {
          throw baseNotFound(commandOptions.path);
        }

        const output = {
          base: result.base.path,
          valid: result.errors.length === 0,
          errors: result.errors,
        };

        if (options.json) {
          writeJson(output, options);
          return;
        }

        writeHuman(output.valid ? "valid" : output.errors.join("\n"), options);
      },
    }),
    command({
      name: "views",
      desc: "List views in a base file",
      options: {
        path: positional("path").desc("Vault-relative base path").required(),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const base = await inspectIndexedBase(vault, commandOptions.path);

        if (!base) {
          throw baseNotFound(commandOptions.path);
        }

        if (options.json) {
          writeJson({ base: base.path, views: base.views }, options);
          return;
        }

        for (const view of base.views) {
          writeHuman(view.name, options);
        }
      },
    }),
    command({
      name: "query",
      desc: "Query a base file",
      options: {
        path: positional("path").desc("Vault-relative base path").required(),
        view: string().desc("View name"),
        context: string().desc("Context file path for this"),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const result = await queryIndexedBase(vault, commandOptions.path, {
          view: commandOptions.view,
          context: commandOptions.context,
        });

        if (!result) {
          throw baseNotFound(commandOptions.path);
        }

        if (options.json) {
          writeJson(serializeBaseOutput(result), options);
          return;
        }

        for (const row of result.rows as Array<{ file: { path: string } }>) {
          writeHuman(row.file.path, options);
        }
      },
    }),
    command({
      name: "render-embed",
      desc: "Render Base embeds in a markdown file",
      options: {
        path: positional("path")
          .desc("Vault-relative markdown path")
          .required(),
      },
      handler: async (commandOptions) => {
        const options = getGlobalOptions();
        const vault = await resolveVaultFromOptions();
        const result = await renderIndexedBaseEmbeds(
          vault,
          commandOptions.path,
        );

        if (!result) {
          throw new ObsdxError(
            "FILE_NOT_FOUND",
            `File not found: ${commandOptions.path}`,
            { path: commandOptions.path },
          );
        }

        if (options.json) {
          writeJson(serializeBaseOutput(result), options);
          return;
        }

        for (const embed of result.embeds) {
          writeHuman(
            `${embed.base}: ${embed.result.rows.length} rows`,
            options,
          );
        }
      },
    }),
  ],
});

function baseNotFound(path: string): ObsdxError {
  return new ObsdxError("BASE_NOT_FOUND", `Base not found: ${path}`, { path });
}

function serializeBaseOutput(value: unknown): unknown {
  if (value instanceof Date) {
    return formatDateForOutput(value);
  }

  if (Array.isArray(value)) {
    return value.map(serializeBaseOutput);
  }

  if (isDurationLike(value)) {
    return formatDurationForOutput(value);
  }

  if (value instanceof Error) {
    return { error: value.message };
  }

  if (isRecord(value)) {
    if (typeof value.markdown === "string") return value.markdown;
    if (typeof value.path === "string" && !("name" in value)) return value.path;
    if (
      isRecord(value.file) &&
      typeof value.file.path === "string" &&
      !("values" in value) &&
      !("formulas" in value) &&
      !("sortValues" in value)
    ) {
      return value.file.path;
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => !isCallableLike(item))
        .map(([key, item]) => [key, serializeBaseOutput(item)]),
    );
  }

  return value;
}

function formatDateForOutput(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
  if (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  ) {
    return datePart;
  }
  return `${datePart}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}`;
}

function formatDurationForOutput(value: Record<string, unknown>): string {
  const milliseconds = Number(value.milliseconds ?? 0);
  const units: Array<[string, number]> = [
    ["year", 365 * 86_400_000],
    ["month", 31 * 86_400_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
    ["second", 1_000],
  ];
  for (const [name, size] of units) {
    const amount = milliseconds / size;
    if (Number.isInteger(amount) && amount !== 0) {
      return `${amount} ${name}${Math.abs(amount) === 1 ? "" : "s"}`;
    }
  }
  return `${milliseconds} milliseconds`;
}

function isDurationLike(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.milliseconds === "number" &&
    typeof value.days === "number"
  );
}

function isCallableLike(value: unknown): boolean {
  return isRecord(value) && typeof value.call === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

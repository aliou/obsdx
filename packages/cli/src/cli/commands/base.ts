import {
  type BaseDefinition,
  resolveContextRequirements,
} from "@aliou/obsdx-base-ast";
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
        const raw = await inspectIndexedBase(vault, commandOptions.path);

        if (!raw) {
          throw baseNotFound(commandOptions.path);
        }

        const base = resolveContextRequirements(raw);

        if (options.json) {
          writeJson({ base }, options);
          return;
        }

        writeHuman(base.path, options);
        writeBaseSummary(base, options);
        writeViewsDetail(base, options);
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
        const raw = await inspectIndexedBase(vault, commandOptions.path);

        if (!raw) {
          throw baseNotFound(commandOptions.path);
        }

        const base = resolveContextRequirements(raw);

        if (options.json) {
          writeJson(
            {
              base: base.path,
              views: base.views.map((v) => ({
                name: v.name,
                type: v.type,
                requiresContext: v.requiresContext,
              })),
            },
            options,
          );
          return;
        }

        for (const view of base.views) {
          const suffix = view.requiresContext ? " (requires context)" : "";
          writeHuman(`${view.name}${suffix}`, options);
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

// ---------------------------------------------------------------------------
// Human-readable base inspect formatting
// ---------------------------------------------------------------------------

function writeBaseSummary(
  base: BaseDefinition,
  options: Pick<GlobalOptions, "quiet">,
): void {
  const indent = "  ";
  const propCount = Object.keys(base.properties).length;
  const formulaCount = Object.keys(base.formulas).length;
  const hasBaseFilters = base.filters != null;
  const hasSummaries =
    base.summaries != null && Object.keys(base.summaries).length > 0;

  if (propCount > 0) {
    const names = Object.keys(base.properties).join(", ");
    writeHuman(`${indent}properties: ${propCount} (${names})`, options);
  }
  if (formulaCount > 0) {
    const names = Object.keys(base.formulas).join(", ");
    writeHuman(`${indent}formulas: ${formulaCount} (${names})`, options);
  }
  if (hasBaseFilters) {
    writeHuman(`${indent}base filters: yes`, options);
  }
  if (hasSummaries) {
    const names = Object.keys(base.summaries ?? {});
    writeHuman(`${indent}summaries: ${names.join(", ")}`, options);
  }
}

function writeViewsDetail(
  base: BaseDefinition,
  options: Pick<GlobalOptions, "quiet">,
): void {
  const indent = "  ";
  const viewIndent = `${indent}${indent}`;

  writeHuman(`${indent}views:`, options);

  for (const [index, view] of base.views.entries()) {
    const tag = `${index + 1}. ${view.name} (${view.type})`;
    writeHuman(`${viewIndent}${tag}`, options);

    if (view.order && view.order.length > 0) {
      writeHuman(`${viewIndent}  columns: ${view.order.join(", ")}`, options);
    }
    if (view.filters != null) {
      const desc = formatFilterSummary(view.filters);
      writeHuman(`${viewIndent}  filters: ${desc}`, options);
    }
    if (view.sort && view.sort.length > 0) {
      const sorts = view.sort
        .map((s) => `${s.property} ${s.direction ?? "ASC"}`)
        .join(", ");
      writeHuman(`${viewIndent}  sort: ${sorts}`, options);
    }
    if (view.limit != null) {
      writeHuman(`${viewIndent}  limit: ${view.limit}`, options);
    }
    if (view.groupBy) {
      writeHuman(
        `${viewIndent}  group by: ${view.groupBy.property} ${view.groupBy.direction}`,
        options,
      );
    }
    if (view.summaries && Object.keys(view.summaries).length > 0) {
      const pairs = Object.entries(view.summaries)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(", ");
      writeHuman(`${viewIndent}  summaries: ${pairs}`, options);
    }
    if (view.requiresContext) {
      writeHuman(`${viewIndent}  requires context: yes`, options);
    }
  }
}

function formatFilterSummary(filters: unknown): string {
  if (typeof filters === "string") {
    return truncate(filters, 60);
  }
  if (Array.isArray(filters)) {
    return filters.map(formatFilterSummary).join(", ");
  }
  if (isRecord(filters)) {
    const parts: string[] = [];
    if (Array.isArray(filters.and)) {
      parts.push(`and(${filters.and.map(formatFilterSummary).join(", ")})`);
    }
    if (Array.isArray(filters.or)) {
      parts.push(`or(${filters.or.map(formatFilterSummary).join(", ")})`);
    }
    if (Array.isArray(filters.not)) {
      parts.push(`not(${filters.not.map(formatFilterSummary).join(", ")})`);
    }
    return parts.length > 0 ? parts.join(", ") : "yes";
  }
  return "yes";
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}\u2026`;
}

type GlobalOptions = Awaited<ReturnType<typeof getGlobalOptions>>;

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

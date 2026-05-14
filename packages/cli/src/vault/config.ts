import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ResolvedVault } from "./discover";

export type VaultConfig = {
  attachmentFolderPath?: string;
  propertyTypes: Record<string, string>;
};

export async function loadVaultConfig(
  vault: ResolvedVault,
): Promise<VaultConfig> {
  const appJson = await readJson<Record<string, unknown>>(
    path.join(vault.obsidianDir, "app.json"),
  );
  const typesJson = await readJson<Record<string, unknown>>(
    path.join(vault.obsidianDir, "types.json"),
  );

  return {
    attachmentFolderPath: stringValue(appJson?.attachmentFolderPath),
    propertyTypes: normalizePropertyTypes(typesJson),
  };
}

async function readJson<T>(filePath: string): Promise<T | undefined> {
  try {
    const contents = await readFile(filePath, "utf8");
    return JSON.parse(contents) as T;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

function normalizePropertyTypes(
  typesJson: Record<string, unknown> | undefined,
): Record<string, string> {
  if (!typesJson) {
    return {};
  }

  const source = isRecord(typesJson.types) ? typesJson.types : typesJson;
  const result: Record<string, string> = {};

  for (const [name, value] of Object.entries(source)) {
    if (typeof value === "string") {
      result[name] = value;
    } else if (isRecord(value) && typeof value.type === "string") {
      result[name] = value.type;
    }
  }

  return result;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

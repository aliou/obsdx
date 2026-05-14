import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { ObsdxError } from "../cli/errors";

export type ResolvedVault = {
  root: string;
  obsidianDir: string;
  cacheDir: string;
};

export async function discoverVault(
  explicitPath?: string,
): Promise<ResolvedVault> {
  const candidates = explicitPath ? [explicitPath] : envAndParentCandidates();

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (await hasObsidianDir(resolved)) {
      return {
        root: resolved,
        obsidianDir: path.join(resolved, ".obsidian"),
        cacheDir: path.join(resolved, ".obsidian", "obsdx"),
      };
    }
  }

  throw new ObsdxError("VAULT_NOT_FOUND", "No Obsidian vault found", {
    searchedFrom: explicitPath ? path.resolve(explicitPath) : process.cwd(),
  });
}

function envAndParentCandidates(): string[] {
  const candidates: string[] = [];

  if (process.env.OBSDX_VAULT) {
    candidates.push(process.env.OBSDX_VAULT);
  }

  let current = process.cwd();
  while (true) {
    candidates.push(current);
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return candidates;
}

async function hasObsidianDir(root: string): Promise<boolean> {
  try {
    await access(path.join(root, ".obsidian"), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

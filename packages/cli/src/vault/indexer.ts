import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  type BaseDefinition,
  parseBase,
  validateBase,
} from "@aliou/obsdx-base-ast";
import {
  type BaseQueryOptions,
  type BaseQueryResult,
  queryBase,
} from "@aliou/obsdx-base-engine";
import { canvasGraph } from "../canvas/graph";
import { type CanvasDocument, parseCanvas } from "../canvas/parser";
import { ObsdxError } from "../cli/errors";
import type { VaultGraph } from "../graph/graph";
import { parseMarkdown } from "../markdown/parser";
import type { CacheDb } from "./cache";
import {
  buildCachedGraph,
  buildTagTree as buildCachedTagTree,
  type CachedLink,
  type CachedProperty,
  type CachedVaultFile,
  type CacheStatus,
  deleteBaseIndexes,
  deleteCachedFiles,
  deleteMarkdownIndexes,
  diffCachedFiles,
  type FileInspection,
  type FileListFilters,
  getCachedBase,
  getCachedFile,
  getCacheStatus,
  inspectCachedFile,
  listAmbiguousLinks,
  listBacklinks,
  listCachedFiles,
  listFileProperties,
  listFilesForProperty,
  listFilesForTag,
  listMentions,
  listPropertyCounts,
  listTagCounts,
  listUnresolvedLinks,
  openVaultCache,
  type PropertyCount,
  replaceBaseIndex,
  replaceIndexedFiles,
  replaceMarkdownIndex,
  resolveCachedLinks,
  type SearchOptions,
  type SearchResult,
  searchCachedMarkdown,
  type TagCount,
  type TaggedFile,
  type TagTreeNode,
  upsertIndexedFiles,
  vacuumCache,
} from "./cache";
import { loadVaultConfig } from "./config";
import type { ResolvedVault } from "./discover";
import { withIndexLock } from "./lock";
import { type ScannedVaultFile, scanVaultFiles } from "./scanner";

export type IndexRefreshResult = {
  indexed: number;
  deleted: number;
  stale: number;
  status: CacheStatus;
};

export type ChangedFilesResult = {
  stale: ScannedVaultFile[];
  deleted: CachedVaultFile[];
};

export async function refreshVaultIndex(
  vault: ResolvedVault,
  options: { rebuild?: boolean; lockTimeoutMs?: number } = {},
): Promise<IndexRefreshResult> {
  return withIndexLock(
    vault,
    async () => {
      const db = await openVaultCache(vault);
      const config = await loadVaultConfig(vault);
      const scannedFiles = await scanVaultFiles(vault.root);
      const changes = diffCachedFiles(db, scannedFiles);

      try {
        if (options.rebuild) {
          replaceIndexedFiles(db, scannedFiles);
          await indexMarkdownFiles(
            db,
            vault,
            scannedFiles,
            config.propertyTypes,
          );
          await indexBaseFiles(db, vault, scannedFiles);
        } else {
          upsertIndexedFiles(db, changes.stale);
          await indexMarkdownFiles(
            db,
            vault,
            changes.stale,
            config.propertyTypes,
          );
          await indexBaseFiles(db, vault, changes.stale);
          deleteMarkdownIndexes(
            db,
            changes.deleted.map((file) => file.path),
          );
          deleteBaseIndexes(
            db,
            changes.deleted.map((file) => file.path),
          );
          deleteCachedFiles(
            db,
            changes.deleted.map((file) => file.path),
          );
        }
        resolveCachedLinks(db);

        const status = getCacheStatus(db, vault, scannedFiles);
        const indexed = options.rebuild
          ? scannedFiles.length
          : changes.stale.length;

        return {
          indexed,
          deleted: changes.deleted.length,
          stale: changes.stale.length,
          status,
        };
      } finally {
        db.close();
      }
    },
    { timeoutMs: options.lockTimeoutMs },
  );
}

export async function readIndexStatus(
  vault: ResolvedVault,
): Promise<CacheStatus> {
  const db = await openVaultCache(vault);
  const scannedFiles = await scanVaultFiles(vault.root);

  try {
    return getCacheStatus(db, vault, scannedFiles);
  } finally {
    db.close();
  }
}

export async function listIndexedFiles(
  vault: ResolvedVault,
  filters: FileListFilters = {},
): Promise<CachedVaultFile[]> {
  await refreshVaultIndex(vault);

  const db = await openVaultCache(vault);
  try {
    return listCachedFiles(db, filters);
  } finally {
    db.close();
  }
}

export async function getIndexedFile(
  vault: ResolvedVault,
  filePath: string,
): Promise<CachedVaultFile | undefined> {
  await refreshVaultIndex(vault);

  const db = await openVaultCache(vault);
  try {
    return getCachedFile(db, filePath);
  } finally {
    db.close();
  }
}

export async function inspectIndexedFile(
  vault: ResolvedVault,
  filePath: string,
): Promise<FileInspection | undefined> {
  await refreshVaultIndex(vault);

  const db = await openVaultCache(vault);
  try {
    return inspectCachedFile(db, filePath);
  } finally {
    db.close();
  }
}

export async function listIndexedOutgoingLinks(
  vault: ResolvedVault,
  filePath: string,
): Promise<CachedLink[] | undefined> {
  const inspection = await inspectIndexedFile(vault, filePath);
  if (!inspection) {
    return undefined;
  }

  return inspection.links;
}

export async function listIndexedBacklinks(
  vault: ResolvedVault,
  filePath: string,
): Promise<CachedLink[] | undefined> {
  await refreshVaultIndex(vault);

  const db = await openVaultCache(vault);
  try {
    if (!getCachedFile(db, filePath)) {
      return undefined;
    }

    return listBacklinks(db, filePath);
  } finally {
    db.close();
  }
}

export async function listIndexedMentions(
  vault: ResolvedVault,
  query: string,
): Promise<CachedLink[]> {
  await refreshVaultIndex(vault);

  const db = await openVaultCache(vault);
  try {
    return listMentions(db, query);
  } finally {
    db.close();
  }
}

export async function listIndexedUnresolvedLinks(
  vault: ResolvedVault,
): Promise<CachedLink[]> {
  await refreshVaultIndex(vault);

  const db = await openVaultCache(vault);
  try {
    return listUnresolvedLinks(db);
  } finally {
    db.close();
  }
}

export async function listIndexedAmbiguousLinks(
  vault: ResolvedVault,
): Promise<CachedLink[]> {
  await refreshVaultIndex(vault);

  const db = await openVaultCache(vault);
  try {
    return listAmbiguousLinks(db);
  } finally {
    db.close();
  }
}

export async function listIndexedTagCounts(
  vault: ResolvedVault,
): Promise<TagCount[]> {
  await refreshVaultIndex(vault);

  const db = await openVaultCache(vault);
  try {
    return listTagCounts(db);
  } finally {
    db.close();
  }
}

export async function listIndexedTagTree(
  vault: ResolvedVault,
): Promise<TagTreeNode[]> {
  const tags = await listIndexedTagCounts(vault);
  return buildCachedTagTree(tags);
}

export async function listIndexedFilesForTag(
  vault: ResolvedVault,
  tag: string,
): Promise<TaggedFile[]> {
  await refreshVaultIndex(vault);

  const db = await openVaultCache(vault);
  try {
    return listFilesForTag(db, tag);
  } finally {
    db.close();
  }
}

export async function listIndexedFilesForProperty(
  vault: ResolvedVault,
  propertyName: string,
  propertyValue?: string,
): Promise<CachedVaultFile[]> {
  await refreshVaultIndex(vault);

  const db = await openVaultCache(vault);
  try {
    return listFilesForProperty(db, propertyName, propertyValue);
  } finally {
    db.close();
  }
}

export async function listIndexedPropertyCounts(
  vault: ResolvedVault,
): Promise<PropertyCount[]> {
  await refreshVaultIndex(vault);

  const db = await openVaultCache(vault);
  try {
    return listPropertyCounts(db);
  } finally {
    db.close();
  }
}

export async function getIndexedProperties(
  vault: ResolvedVault,
  filePath: string,
): Promise<CachedProperty[] | undefined> {
  await refreshVaultIndex(vault);

  const db = await openVaultCache(vault);
  try {
    return listFileProperties(db, filePath);
  } finally {
    db.close();
  }
}

export async function searchIndexedMarkdown(
  vault: ResolvedVault,
  options: SearchOptions,
): Promise<SearchResult[]> {
  await refreshVaultIndex(vault);

  const db = await openVaultCache(vault);
  try {
    return searchCachedMarkdown(db, options);
  } finally {
    db.close();
  }
}

export async function listIndexedBases(
  vault: ResolvedVault,
): Promise<CachedVaultFile[]> {
  return listIndexedFiles(vault, { ext: "base" });
}

export async function inspectIndexedBase(
  vault: ResolvedVault,
  filePath: string,
): Promise<BaseDefinition | undefined> {
  await refreshVaultIndex(vault);

  const db = await openVaultCache(vault);
  try {
    const file = getCachedFile(db, filePath);
    if (!file || file.kind !== "base") {
      return undefined;
    }

    const base = getCachedBase(db, filePath);
    if (!base) {
      return readBaseDefinition(vault, filePath);
    }

    if (base.parseError) {
      throw new ObsdxError("BASE_PARSE_ERROR", base.parseError, {
        base: filePath,
      });
    }

    return base.definition ?? undefined;
  } finally {
    db.close();
  }
}

export async function validateIndexedBase(
  vault: ResolvedVault,
  filePath: string,
): Promise<{ base: BaseDefinition; errors: string[] } | undefined> {
  const base = await inspectIndexedBase(vault, filePath);
  if (!base) {
    return undefined;
  }

  return { base, errors: validateBase(base) };
}

export async function queryIndexedBase(
  vault: ResolvedVault,
  filePath: string,
  options: BaseQueryOptions = {},
): Promise<BaseQueryResult | undefined> {
  const base = await inspectIndexedBase(vault, filePath);
  if (!base) {
    return undefined;
  }

  await refreshVaultIndex(vault);
  const db = await openVaultCache(vault);
  try {
    const files = listCachedFiles(db);
    const inspections = files.flatMap((file) => {
      const inspection = inspectCachedFile(db, file.path);
      return inspection ? [inspection] : [];
    });

    return queryBase(base, inspections, options);
  } finally {
    db.close();
  }
}

export async function renderIndexedBaseEmbeds(
  vault: ResolvedVault,
  filePath: string,
): Promise<
  | {
      file: string;
      embeds: Array<{
        raw: string;
        base: string;
        view?: string;
        result: BaseQueryResult;
      }>;
    }
  | undefined
> {
  const inspection = await inspectIndexedFile(vault, filePath);
  if (!inspection) {
    return undefined;
  }

  const embeds = [];
  for (const link of inspection.embeds) {
    if (!link.resolvedPath?.endsWith(".base")) {
      continue;
    }

    const result = await queryIndexedBase(vault, link.resolvedPath, {
      view: link.heading ?? undefined,
      context: filePath,
    });
    if (result) {
      embeds.push({
        raw: link.raw,
        base: link.resolvedPath,
        view: link.heading ?? undefined,
        result,
      });
    }
  }

  return { file: filePath, embeds };
}

export async function exportIndexedGraph(
  vault: ResolvedVault,
): Promise<VaultGraph> {
  await refreshVaultIndex(vault);

  const db = await openVaultCache(vault);
  try {
    return buildCachedGraph(db);
  } finally {
    db.close();
  }
}

export async function listIndexedCanvases(
  vault: ResolvedVault,
): Promise<CachedVaultFile[]> {
  return listIndexedFiles(vault, { ext: "canvas" });
}

export async function inspectIndexedCanvas(
  vault: ResolvedVault,
  filePath: string,
): Promise<CanvasDocument | undefined> {
  await refreshVaultIndex(vault);

  const db = await openVaultCache(vault);
  try {
    const file = getCachedFile(db, filePath);
    if (!file || file.kind !== "canvas") {
      return undefined;
    }
  } finally {
    db.close();
  }

  return readCanvasDocument(vault, filePath);
}

export async function exportIndexedCanvasGraph(
  vault: ResolvedVault,
  filePath: string,
): Promise<VaultGraph | undefined> {
  const canvas = await inspectIndexedCanvas(vault, filePath);
  return canvas ? canvasGraph(filePath, canvas) : undefined;
}

export async function listChangedFiles(
  vault: ResolvedVault,
): Promise<ChangedFilesResult> {
  const db = await openVaultCache(vault);
  const scannedFiles = await scanVaultFiles(vault.root);

  try {
    return diffCachedFiles(db, scannedFiles);
  } finally {
    db.close();
  }
}

async function readBaseDefinition(
  vault: ResolvedVault,
  filePath: string,
): Promise<BaseDefinition> {
  const source = await readFile(path.join(vault.root, filePath), "utf8");
  return parseBase(filePath, source);
}

async function readCanvasDocument(
  vault: ResolvedVault,
  filePath: string,
): Promise<CanvasDocument> {
  const source = await readFile(path.join(vault.root, filePath), "utf8");
  return parseCanvas(source);
}

export async function vacuumVaultCache(vault: ResolvedVault): Promise<void> {
  const db = await openVaultCache(vault);

  try {
    vacuumCache(db);
  } finally {
    db.close();
  }
}

async function indexMarkdownFiles(
  db: CacheDb,
  vault: ResolvedVault,
  files: ScannedVaultFile[],
  propertyTypes: Record<string, string>,
): Promise<void> {
  for (const file of files) {
    if (file.kind !== "markdown") {
      continue;
    }

    const source = await readFile(path.join(vault.root, file.path), "utf8");
    replaceMarkdownIndex(db, file.path, parseMarkdown(source, propertyTypes));
  }
}

async function indexBaseFiles(
  db: CacheDb,
  vault: ResolvedVault,
  files: ScannedVaultFile[],
): Promise<void> {
  for (const file of files) {
    if (file.kind !== "base") {
      continue;
    }

    const source = await readFile(path.join(vault.root, file.path), "utf8");
    try {
      replaceBaseIndex(db, file.path, parseBase(file.path, source), null);
    } catch (error) {
      replaceBaseIndex(
        db,
        file.path,
        null,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

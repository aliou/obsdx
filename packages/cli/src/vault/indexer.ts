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
import {
  buildTagTree,
  type CachedLink,
  type CachedProperty,
  type CachedVaultFile,
  type CacheStatus,
  type FileInspection,
  type FileListFilters,
  type MarkdownIndexInput,
  type PropertyCount,
  type ScannedVaultFile,
  type SearchOptions,
  type SearchResult,
  type TagCount,
  type TaggedFile,
  type TagTreeNode,
  type VaultGraph,
  type VaultIndexStore,
} from "@aliou/obsdx-index";
import { canvasGraph } from "../canvas/graph";
import { type CanvasDocument, parseCanvas } from "../canvas/parser";
import { ObsdxError } from "../cli/errors";
import { type MarkdownParseResult, parseMarkdown } from "../markdown/parser";
import { loadVaultConfig } from "./config";
import type { ResolvedVault } from "./discover";
import { withIndexLock } from "./lock";
import { scanVaultFiles } from "./scanner";
import { openSqliteVaultIndex } from "./sqlite-store";

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

async function withStore<T>(
  vault: ResolvedVault,
  fn: (store: VaultIndexStore) => Promise<T> | T,
): Promise<T> {
  const store = await openSqliteVaultIndex(vault);
  try {
    return await fn(store);
  } finally {
    store.close();
  }
}

export async function refreshVaultIndex(
  vault: ResolvedVault,
  options: { rebuild?: boolean; lockTimeoutMs?: number } = {},
): Promise<IndexRefreshResult> {
  return withIndexLock(
    vault,
    () =>
      withStore(vault, async (store) => {
        const config = await loadVaultConfig(vault);
        const scannedFiles = await scanVaultFiles(vault.root);
        const changes = store.diffFiles(scannedFiles);

        if (options.rebuild) {
          store.replaceFiles(scannedFiles);
          await indexMarkdownFiles(
            store,
            vault,
            scannedFiles,
            config.propertyTypes,
          );
          await indexBaseFiles(store, vault, scannedFiles);
        } else {
          store.upsertFiles(changes.stale);
          await indexMarkdownFiles(
            store,
            vault,
            changes.stale,
            config.propertyTypes,
          );
          await indexBaseFiles(store, vault, changes.stale);
          const deletedPaths = changes.deleted.map((file) => file.path);
          store.deleteMarkdown(deletedPaths);
          store.deleteBase(deletedPaths);
          store.deleteFiles(deletedPaths);
        }
        store.resolveLinks();

        const status = store.getStatus(scannedFiles);
        const indexed = options.rebuild
          ? scannedFiles.length
          : changes.stale.length;

        return {
          indexed,
          deleted: changes.deleted.length,
          stale: changes.stale.length,
          status,
        };
      }),
    { timeoutMs: options.lockTimeoutMs },
  );
}

export async function readIndexStatus(
  vault: ResolvedVault,
): Promise<CacheStatus> {
  const scannedFiles = await scanVaultFiles(vault.root);
  return withStore(vault, (store) => store.getStatus(scannedFiles));
}

export async function listIndexedFiles(
  vault: ResolvedVault,
  filters: FileListFilters = {},
): Promise<CachedVaultFile[]> {
  await refreshVaultIndex(vault);
  return withStore(vault, (store) => store.listFiles(filters));
}

export async function getIndexedFile(
  vault: ResolvedVault,
  filePath: string,
): Promise<CachedVaultFile | undefined> {
  await refreshVaultIndex(vault);
  return withStore(vault, (store) => store.getFile(filePath));
}

export async function inspectIndexedFile(
  vault: ResolvedVault,
  filePath: string,
): Promise<FileInspection | undefined> {
  await refreshVaultIndex(vault);
  return withStore(vault, (store) => store.inspectFile(filePath));
}

export async function listIndexedOutgoingLinks(
  vault: ResolvedVault,
  filePath: string,
): Promise<CachedLink[] | undefined> {
  const inspection = await inspectIndexedFile(vault, filePath);
  return inspection?.links;
}

export async function listIndexedBacklinks(
  vault: ResolvedVault,
  filePath: string,
): Promise<CachedLink[] | undefined> {
  await refreshVaultIndex(vault);
  return withStore(vault, (store) => {
    if (!store.getFile(filePath)) {
      return undefined;
    }
    return store.listBacklinks(filePath);
  });
}

export async function listIndexedMentions(
  vault: ResolvedVault,
  query: string,
): Promise<CachedLink[]> {
  await refreshVaultIndex(vault);
  return withStore(vault, (store) => store.listMentions(query));
}

export async function listIndexedUnresolvedLinks(
  vault: ResolvedVault,
): Promise<CachedLink[]> {
  await refreshVaultIndex(vault);
  return withStore(vault, (store) => store.listUnresolvedLinks());
}

export async function listIndexedAmbiguousLinks(
  vault: ResolvedVault,
): Promise<CachedLink[]> {
  await refreshVaultIndex(vault);
  return withStore(vault, (store) => store.listAmbiguousLinks());
}

export async function listIndexedTagCounts(
  vault: ResolvedVault,
): Promise<TagCount[]> {
  await refreshVaultIndex(vault);
  return withStore(vault, (store) => store.listTagCounts());
}

export async function listIndexedTagTree(
  vault: ResolvedVault,
): Promise<TagTreeNode[]> {
  const tags = await listIndexedTagCounts(vault);
  return buildTagTree(tags);
}

export async function listIndexedFilesForTag(
  vault: ResolvedVault,
  tag: string,
): Promise<TaggedFile[]> {
  await refreshVaultIndex(vault);
  return withStore(vault, (store) => store.listFilesForTag(tag));
}

export async function listIndexedFilesForProperty(
  vault: ResolvedVault,
  propertyName: string,
  propertyValue?: string,
): Promise<CachedVaultFile[]> {
  await refreshVaultIndex(vault);
  return withStore(vault, (store) =>
    store.listFilesForProperty(propertyName, propertyValue),
  );
}

export async function listIndexedPropertyCounts(
  vault: ResolvedVault,
): Promise<PropertyCount[]> {
  await refreshVaultIndex(vault);
  return withStore(vault, (store) => store.listPropertyCounts());
}

export async function getIndexedProperties(
  vault: ResolvedVault,
  filePath: string,
): Promise<CachedProperty[] | undefined> {
  await refreshVaultIndex(vault);
  return withStore(vault, (store) => store.listFileProperties(filePath));
}

export async function searchIndexedMarkdown(
  vault: ResolvedVault,
  options: SearchOptions,
): Promise<SearchResult[]> {
  await refreshVaultIndex(vault);
  return withStore(vault, (store) => store.searchMarkdown(options));
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
  return withStore(vault, async (store) => {
    const file = store.getFile(filePath);
    if (!file || file.kind !== "base") {
      return undefined;
    }

    const base = store.getBase(filePath);
    if (!base) {
      return readBaseDefinition(vault, filePath);
    }

    if (base.parseError) {
      throw new ObsdxError("BASE_PARSE_ERROR", base.parseError, {
        base: filePath,
      });
    }

    return base.definition ?? undefined;
  });
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
  return withStore(vault, (store) => {
    const files = store.listFiles();
    const inspections = files.flatMap((file) => {
      const inspection = store.inspectFile(file.path);
      return inspection ? [inspection] : [];
    });

    return queryBase(base, inspections, options);
  });
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
  return withStore(vault, (store) => store.buildGraph());
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
  const exists = await withStore(vault, (store) => {
    const file = store.getFile(filePath);
    return file?.kind === "canvas";
  });
  if (!exists) {
    return undefined;
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
  const scannedFiles = await scanVaultFiles(vault.root);
  return withStore(vault, (store) => store.diffFiles(scannedFiles));
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
  return withStore(vault, (store) => {
    store.vacuum();
  });
}

async function indexMarkdownFiles(
  store: VaultIndexStore,
  vault: ResolvedVault,
  files: ScannedVaultFile[],
  propertyTypes: Record<string, string>,
): Promise<void> {
  for (const file of files) {
    if (file.kind !== "markdown") {
      continue;
    }

    const source = await readFile(path.join(vault.root, file.path), "utf8");
    store.replaceMarkdown(
      file.path,
      toMarkdownIndexInput(parseMarkdown(source, propertyTypes)),
    );
  }
}

async function indexBaseFiles(
  store: VaultIndexStore,
  vault: ResolvedVault,
  files: ScannedVaultFile[],
): Promise<void> {
  for (const file of files) {
    if (file.kind !== "base") {
      continue;
    }

    const source = await readFile(path.join(vault.root, file.path), "utf8");
    try {
      store.replaceBase(file.path, {
        definition: parseBase(file.path, source),
        parseError: null,
      });
    } catch (error) {
      store.replaceBase(file.path, {
        definition: null,
        parseError: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function toMarkdownIndexInput(parsed: MarkdownParseResult): MarkdownIndexInput {
  return {
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    bodyStartLine: parsed.bodyStartLine,
    parseError: parsed.frontmatterError ?? null,
    properties: Object.entries(parsed.properties).map(([name, value]) => ({
      name,
      value,
      valueType: parsed.propertyValueTypes[name] ?? defaultValueType(value),
    })),
    tags: parsed.tags.map((tag) => ({
      tag: tag.tag,
      source: tag.source,
      line: tag.line ?? null,
    })),
    links: [
      ...parsed.wikilinks.map((link) => ({
        raw: link.raw,
        kind: "wikilink" as const,
        embedded: link.embedded,
        targetText: link.targetText,
        targetPathText: link.targetText,
        heading: link.heading ?? null,
        blockId: link.blockId ?? null,
        display: link.display ?? null,
        line: link.line ?? null,
        column: link.column ?? null,
      })),
      ...parsed.markdownLinks.map((link) => ({
        raw: link.raw,
        kind: "markdown" as const,
        embedded: link.embedded,
        targetText: link.target,
        targetPathText: link.target,
        heading: null,
        blockId: null,
        display: link.label,
        line: link.line ?? null,
        column: link.column ?? null,
      })),
    ],
    headings: parsed.headings,
    blocks: parsed.blocks.map((block) => ({
      blockId: block.blockId,
      line: block.line,
    })),
  };
}

function defaultValueType(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "list";
  }

  return typeof value;
}

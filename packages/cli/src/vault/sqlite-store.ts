import type {
  BaseIndexInput,
  CachedBase,
  CachedLink,
  CachedProperty,
  CachedVaultFile,
  CacheStatus,
  FileInspection,
  FileListFilters,
  IndexDiff,
  MarkdownIndexInput,
  PropertyCount,
  ScannedVaultFile,
  SearchOptions,
  SearchResult,
  TagCount,
  TaggedFile,
  VaultGraph,
  VaultIndexStore,
} from "@aliou/obsdx-index";
import {
  buildCachedGraph,
  type CacheDb,
  deleteBaseIndexes,
  deleteCachedFiles,
  deleteMarkdownIndexes,
  diffCachedFiles,
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
  replaceBaseIndex,
  replaceIndexedFiles,
  replaceMarkdownIndex,
  resolveCachedLinks,
  searchCachedMarkdown,
  upsertIndexedFiles,
  vacuumCache,
} from "./cache";
import type { ResolvedVault } from "./discover";

/**
 * Open the SQLite-backed `VaultIndexStore` for the given vault.
 *
 * Callers must invoke `close()` when finished to release the database handle.
 */
export async function openSqliteVaultIndex(
  vault: ResolvedVault,
): Promise<VaultIndexStore> {
  const db = await openVaultCache(vault);
  return new SqliteVaultIndexStore(vault, db);
}

class SqliteVaultIndexStore implements VaultIndexStore {
  constructor(
    private readonly vault: ResolvedVault,
    private readonly db: CacheDb,
  ) {}

  close(): void {
    this.db.close();
  }

  diffFiles(currentFiles: ScannedVaultFile[]): IndexDiff {
    return diffCachedFiles(this.db, currentFiles);
  }

  replaceFiles(files: ScannedVaultFile[]): void {
    replaceIndexedFiles(this.db, files);
  }

  upsertFiles(files: ScannedVaultFile[]): void {
    upsertIndexedFiles(this.db, files);
  }

  deleteFiles(paths: string[]): void {
    deleteCachedFiles(this.db, paths);
  }

  replaceMarkdown(filePath: string, input: MarkdownIndexInput): void {
    replaceMarkdownIndex(this.db, filePath, input);
  }

  deleteMarkdown(paths: string[]): void {
    deleteMarkdownIndexes(this.db, paths);
  }

  replaceBase(filePath: string, input: BaseIndexInput): void {
    replaceBaseIndex(this.db, filePath, input);
  }

  deleteBase(paths: string[]): void {
    deleteBaseIndexes(this.db, paths);
  }

  resolveLinks(): void {
    resolveCachedLinks(this.db);
  }

  vacuum(): void {
    vacuumCache(this.db);
  }

  getStatus(currentFiles: ScannedVaultFile[]): CacheStatus {
    return getCacheStatus(this.db, this.vault, currentFiles);
  }

  listFiles(filters?: FileListFilters): CachedVaultFile[] {
    return listCachedFiles(this.db, filters);
  }

  getFile(filePath: string): CachedVaultFile | undefined {
    return getCachedFile(this.db, filePath);
  }

  inspectFile(filePath: string): FileInspection | undefined {
    return inspectCachedFile(this.db, filePath);
  }

  listBacklinks(filePath: string): CachedLink[] {
    return listBacklinks(this.db, filePath);
  }

  listMentions(query: string): CachedLink[] {
    return listMentions(this.db, query);
  }

  listUnresolvedLinks(): CachedLink[] {
    return listUnresolvedLinks(this.db);
  }

  listAmbiguousLinks(): CachedLink[] {
    return listAmbiguousLinks(this.db);
  }

  listTagCounts(): TagCount[] {
    return listTagCounts(this.db);
  }

  listFilesForTag(tag: string): TaggedFile[] {
    return listFilesForTag(this.db, tag);
  }

  listPropertyCounts(): PropertyCount[] {
    return listPropertyCounts(this.db);
  }

  listFileProperties(filePath: string): CachedProperty[] | undefined {
    return listFileProperties(this.db, filePath);
  }

  listFilesForProperty(name: string, value?: string): CachedVaultFile[] {
    return listFilesForProperty(this.db, name, value);
  }

  searchMarkdown(options: SearchOptions): SearchResult[] {
    return searchCachedMarkdown(this.db, options);
  }

  getBase(filePath: string): CachedBase | undefined {
    return getCachedBase(this.db, filePath);
  }

  buildGraph(): VaultGraph {
    return buildCachedGraph(this.db);
  }
}

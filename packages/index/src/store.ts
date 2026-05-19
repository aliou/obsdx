import type {
  CachedVaultFile,
  CacheStatus,
  FileListFilters,
  ScannedVaultFile,
} from "./files";
import type { VaultGraph } from "./graph";
import type { BaseIndexInput, MarkdownIndexInput } from "./inputs";
import type {
  CachedBase,
  CachedLink,
  CachedProperty,
  FileInspection,
  PropertyCount,
  TagCount,
  TaggedFile,
} from "./model";
import type { SearchOptions, SearchResult } from "./search";

export type IndexDiff = {
  stale: ScannedVaultFile[];
  deleted: CachedVaultFile[];
};

/**
 * Storage backend for a vault index.
 *
 * Implementations own the underlying durable representation (SQLite, in-memory,
 * etc.) and expose typed read/write operations against the indexed model. The
 * orchestration layer (refresh, scanning, parsing) lives outside this contract.
 */
export interface VaultIndexStore {
  /** Release any resources held by the store. */
  close(): void;

  // --- file lifecycle -------------------------------------------------------

  diffFiles(currentFiles: ScannedVaultFile[]): IndexDiff;
  replaceFiles(files: ScannedVaultFile[]): void;
  upsertFiles(files: ScannedVaultFile[]): void;
  deleteFiles(paths: string[]): void;

  // --- markdown / base content ---------------------------------------------

  replaceMarkdown(filePath: string, input: MarkdownIndexInput): void;
  deleteMarkdown(paths: string[]): void;

  replaceBase(filePath: string, input: BaseIndexInput): void;
  deleteBase(paths: string[]): void;

  // --- post-processing ------------------------------------------------------

  resolveLinks(): void;
  vacuum(): void;

  // --- read: files ----------------------------------------------------------

  getStatus(currentFiles: ScannedVaultFile[]): CacheStatus;
  listFiles(filters?: FileListFilters): CachedVaultFile[];
  getFile(filePath: string): CachedVaultFile | undefined;
  inspectFile(filePath: string): FileInspection | undefined;

  // --- read: links ----------------------------------------------------------

  listBacklinks(filePath: string): CachedLink[];
  listMentions(query: string): CachedLink[];
  listUnresolvedLinks(): CachedLink[];
  listAmbiguousLinks(): CachedLink[];

  // --- read: tags / properties / search ------------------------------------

  listTagCounts(): TagCount[];
  listFilesForTag(tag: string): TaggedFile[];

  listPropertyCounts(): PropertyCount[];
  listFileProperties(filePath: string): CachedProperty[] | undefined;
  listFilesForProperty(name: string, value?: string): CachedVaultFile[];

  searchMarkdown(options: SearchOptions): SearchResult[];

  // --- read: base / graph --------------------------------------------------

  getBase(filePath: string): CachedBase | undefined;
  buildGraph(): VaultGraph;
}

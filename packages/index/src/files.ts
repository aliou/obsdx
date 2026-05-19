export type VaultFileKind =
  | "markdown"
  | "base"
  | "canvas"
  | "image"
  | "pdf"
  | "audio"
  | "video"
  | "attachment"
  | "unknown";

export type ScannedVaultFile = {
  path: string;
  name: string;
  basename: string;
  ext: string;
  folder: string;
  kind: VaultFileKind;
  size: number;
  ctime: string;
  mtime: string;
};

export type CachedVaultFile = ScannedVaultFile & {
  indexedAt: string;
  parseError: string | null;
};

export type FileListFilters = {
  folder?: string;
  ext?: string;
};

export type CacheStatus = {
  vault: string;
  cache: string;
  schemaVersion: number;
  parserVersion: string;
  files: number;
  markdownFiles: number;
  baseFiles: number;
  canvasFiles: number;
  staleFiles: number;
  deletedFiles: number;
  lastIndexedAt: string | null;
};

import type { CachedVaultFile } from "./files";

export type SearchOptions = {
  query?: string;
  regex?: string;
  folder?: string;
  ext?: string;
  tag?: string;
  property?: string;
  path?: string;
  linkedTo?: string;
  linksFrom?: string;
  limit?: number;
};

export type SearchMatch = {
  line: number | null;
  column: number | null;
  text: string;
};

export type SearchResult = {
  file: CachedVaultFile;
  matches: SearchMatch[];
  rank?: number;
  snippet?: string;
};

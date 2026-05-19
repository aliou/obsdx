import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type * as Sqlite from "node:sqlite";
import type { BaseDefinition } from "@aliou/obsdx-base-ast";
import type {
  BaseIndexInput,
  CachedBase,
  CachedBlock,
  CachedHeading,
  CachedLink,
  CachedProperty,
  CachedTag,
  CachedVaultFile,
  CacheStatus,
  FileInspection,
  FileListFilters,
  GraphEdge,
  GraphEdgeKind,
  MarkdownIndexInput,
  PropertyCount,
  ScannedVaultFile,
  SearchMatch,
  SearchOptions,
  SearchResult,
  TagCount,
  TaggedFile,
  VaultFileKind,
  VaultGraph,
} from "@aliou/obsdx-index";
import { ObsdxError } from "../cli/errors";
import type { ResolvedVault } from "./discover";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof Sqlite;

type CacheDb = InstanceType<typeof DatabaseSync>;

/** Parse JSON from a database row, wrapping corrupt values as a typed error. */
function safeJsonParse<T = unknown>(json: string, context?: string): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new ObsdxError(
      "CACHE_CORRUPT_ROW",
      context
        ? `Corrupt JSON in cache row (${context})`
        : "Corrupt JSON in cache row",
    );
  }
}

/** Transaction helper using savepoints for nesting. */
let savepointCounter = 0;

function withTransaction<T>(db: CacheDb, fn: () => T): T {
  if (db.isTransaction) {
    const name = `obsdx_sp_${++savepointCounter}`;
    db.exec(`SAVEPOINT ${name}`);

    try {
      const result = fn();
      db.exec(`RELEASE ${name}`);
      return result;
    } catch (error) {
      db.exec(`ROLLBACK TO ${name}`);
      db.exec(`RELEASE ${name}`);
      throw error;
    }
  }

  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export type { CacheDb };

export const CACHE_SCHEMA_VERSION = 1;
export const PARSER_VERSION = "0.1.0";

export type CacheMetadata = {
  schemaVersion: number;
  parserVersion: string;
};

type CountRow = {
  count: number;
};

type LastIndexedRow = {
  lastIndexedAt: string | null;
};

type MetaRow = {
  value: string;
};

type DbFileRow = {
  path: string;
  name: string;
  basename: string;
  ext: string;
  folder: string;
  kind: VaultFileKind;
  size: number;
  ctime: string | null;
  mtime: string | null;
  indexed_at: string;
  parse_error: string | null;
};

type DbMarkdownRow = {
  frontmatter_json: string | null;
  body_text: string;
  body_start_line: number;
};

type DbPropertyRow = {
  name: string;
  value_json: string;
  value_type: string;
};

type DbTagRow = {
  tag: string;
  source: string;
  line: number | null;
};

type DbLinkRow = {
  id?: number;
  source_path?: string;
  raw: string;
  kind: string;
  embedded: number;
  target_text: string;
  target_path_text: string | null;
  heading: string | null;
  block_id: string | null;
  display: string | null;
  resolved_path: string | null;
  unresolved: number;
  ambiguous_paths_json?: string | null;
  line: number | null;
  column: number | null;
};

type DbLinkResolveRow = Required<Pick<DbLinkRow, "id" | "source_path">> &
  Pick<
    DbLinkRow,
    "target_text" | "target_path_text" | "heading" | "block_id" | "kind" | "raw"
  >;

type DbHeadingRow = {
  level: number;
  text: string;
  slug: string;
  line: number;
};

type DbBlockRow = {
  block_id: string;
  line: number;
};

type DbTagCountRow = {
  tag: string;
  count: number;
};

type DbPropertyCountRow = {
  name: string;
  count: number;
};

type DbSearchRow = DbFileRow & {
  body_text: string;
  body_start_line: number;
  frontmatter_json: string | null;
  rank?: number;
  snippet?: string;
};

type SearchMatcher = (value: string) => { index: number | null } | undefined;

export async function openVaultCache(vault: ResolvedVault): Promise<CacheDb> {
  await mkdir(vault.cacheDir, { recursive: true });
  await writeMetadataFile(vault);

  const db = new DatabaseSync(path.join(vault.cacheDir, "index.sqlite"), {
    timeout: 5000,
    enableForeignKeyConstraints: true,
    allowBareNamedParameters: true,
    allowUnknownNamedParameters: false,
  });

  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  ensureSchema(db);

  return db;
}

export function ensureSchema(db: CacheDb): void {
  db.exec(`
    create table if not exists meta (
      key text primary key,
      value text not null
    );

    create table if not exists files (
      path text primary key,
      name text not null,
      basename text not null,
      ext text not null,
      folder text not null,
      kind text not null,
      size integer not null,
      ctime text,
      mtime text,
      hash text,
      indexed_at text not null,
      parse_error text
    );

    create index if not exists idx_files_ext on files(ext);
    create index if not exists idx_files_folder on files(folder);
    create index if not exists idx_files_kind on files(kind);

    create table if not exists markdown (
      file_path text primary key references files(path) on delete cascade,
      frontmatter_json text,
      body_text text not null,
      body_start_line integer not null
    );

    create virtual table if not exists search_index using fts5(
      file_path unindexed,
      path,
      title,
      body,
      frontmatter
    );

    create table if not exists properties (
      file_path text not null references files(path) on delete cascade,
      name text not null,
      value_json text,
      value_type text,
      primary key (file_path, name)
    );

    create table if not exists tags (
      file_path text not null references files(path) on delete cascade,
      tag text not null,
      source text not null,
      line integer,
      primary key (file_path, tag, source, line)
    );

    create table if not exists links (
      id integer primary key autoincrement,
      source_path text not null references files(path) on delete cascade,
      raw text not null,
      kind text not null,
      embedded integer not null default 0,
      target_text text not null,
      target_path_text text,
      heading text,
      block_id text,
      display text,
      resolved_path text,
      ambiguous_paths_json text,
      unresolved integer not null default 0,
      line integer,
      column integer
    );

    create table if not exists headings (
      file_path text not null references files(path) on delete cascade,
      level integer not null,
      text text not null,
      slug text not null,
      line integer not null,
      primary key (file_path, slug, line)
    );

    create table if not exists blocks (
      file_path text not null references files(path) on delete cascade,
      block_id text not null,
      line integer not null,
      primary key (file_path, block_id)
    );

    create table if not exists bases (
      path text primary key references files(path) on delete cascade,
      yaml_json text,
      parse_error text,
      parsed_at text not null
    );

    create index if not exists idx_properties_name on properties(name);
    create index if not exists idx_tags_tag on tags(tag);
    create index if not exists idx_links_source on links(source_path);
    create index if not exists idx_links_resolved on links(resolved_path);
    create index if not exists idx_links_unresolved on links(unresolved);
  `);

  validateMetadata(db);
  writeMetadata(db);
}

export function resetCache(db: CacheDb): void {
  db.exec("delete from files");
  writeMetadata(db);
}

export function upsertIndexedFiles(
  db: CacheDb,
  files: ScannedVaultFile[],
): void {
  if (files.length === 0) {
    return;
  }

  const indexedAt = new Date().toISOString();
  const upsert = db.prepare(`
    insert into files (
      path,
      name,
      basename,
      ext,
      folder,
      kind,
      size,
      ctime,
      mtime,
      hash,
      indexed_at,
      parse_error
    )
    values (
      @path,
      @name,
      @basename,
      @ext,
      @folder,
      @kind,
      @size,
      @ctime,
      @mtime,
      null,
      @indexedAt,
      null
    )
    on conflict(path) do update set
      name = excluded.name,
      basename = excluded.basename,
      ext = excluded.ext,
      folder = excluded.folder,
      kind = excluded.kind,
      size = excluded.size,
      ctime = excluded.ctime,
      mtime = excluded.mtime,
      hash = excluded.hash,
      indexed_at = excluded.indexed_at,
      parse_error = excluded.parse_error
  `);

  withTransaction(db, () => {
    for (const file of files) {
      upsert.run({ ...file, indexedAt });
    }
  });
}

export function deleteCachedFiles(db: CacheDb, paths: string[]): void {
  if (paths.length === 0) {
    return;
  }

  const remove = db.prepare("delete from files where path = ?");

  withTransaction(db, () => {
    for (const filePath of paths) {
      remove.run(filePath);
    }
  });
}

export function replaceMarkdownIndex(
  db: CacheDb,
  filePath: string,
  input: MarkdownIndexInput,
): void {
  withTransaction(db, () => {
    deleteMarkdownIndex(db, filePath);

    db.prepare(`
      insert into markdown (
        file_path,
        frontmatter_json,
        body_text,
        body_start_line
      )
      values (?, ?, ?, ?)
    `).run(
      filePath,
      input.frontmatter ? JSON.stringify(input.frontmatter) : null,
      input.body,
      input.bodyStartLine,
    );
    db.prepare("delete from search_index where file_path = ?").run(filePath);
    db.prepare(
      "insert into search_index (file_path, path, title, body, frontmatter) values (?, ?, ?, ?, ?)",
    ).run(
      filePath,
      filePath,
      path.basename(filePath, path.extname(filePath)),
      input.body,
      input.frontmatter ? JSON.stringify(input.frontmatter) : "",
    );

    const insertProperty = db.prepare(`
      insert into properties (file_path, name, value_json, value_type)
      values (?, ?, ?, ?)
    `);
    for (const property of input.properties) {
      insertProperty.run(
        filePath,
        property.name,
        JSON.stringify(property.value),
        property.valueType,
      );
    }

    const insertTag = db.prepare(`
      insert into tags (file_path, tag, source, line)
      values (?, ?, ?, ?)
    `);
    for (const tag of input.tags) {
      insertTag.run(filePath, tag.tag, tag.source, tag.line ?? null);
    }

    const insertLink = db.prepare(`
      insert into links (
        source_path,
        raw,
        kind,
        embedded,
        target_text,
        target_path_text,
        heading,
        block_id,
        display,
        resolved_path,
        unresolved,
        line,
        column
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, null, 1, ?, ?)
    `);
    for (const link of input.links) {
      insertLink.run(
        filePath,
        link.raw,
        link.kind,
        link.embedded ? 1 : 0,
        link.targetText,
        link.targetPathText,
        link.heading,
        link.blockId,
        link.display,
        link.line,
        link.column,
      );
    }

    const insertHeading = db.prepare(`
      insert into headings (file_path, level, text, slug, line)
      values (?, ?, ?, ?, ?)
    `);
    for (const heading of input.headings) {
      insertHeading.run(
        filePath,
        heading.level,
        heading.text,
        heading.slug,
        heading.line,
      );
    }

    const insertBlock = db.prepare(`
      insert into blocks (file_path, block_id, line)
      values (?, ?, ?)
    `);
    for (const block of input.blocks) {
      insertBlock.run(filePath, block.blockId, block.line);
    }

    updateParseError(db, filePath, input.parseError);
  });
}

export function deleteMarkdownIndexes(db: CacheDb, paths: string[]): void {
  if (paths.length === 0) {
    return;
  }

  withTransaction(db, () => {
    for (const filePath of paths) {
      deleteMarkdownIndex(db, filePath);
    }
  });
}

export function replaceBaseIndex(
  db: CacheDb,
  filePath: string,
  input: BaseIndexInput,
): void {
  withTransaction(db, () => {
    deleteBaseIndex(db, filePath);
    db.prepare(`
      insert into bases (path, yaml_json, parse_error, parsed_at)
      values (?, ?, ?, ?)
    `).run(
      filePath,
      input.definition ? JSON.stringify(input.definition) : null,
      input.parseError,
      new Date().toISOString(),
    );
    updateParseError(db, filePath, input.parseError);
  });
}

export function deleteBaseIndexes(db: CacheDb, paths: string[]): void {
  if (paths.length === 0) {
    return;
  }

  withTransaction(db, () => {
    for (const filePath of paths) {
      deleteBaseIndex(db, filePath);
    }
  });
}

export function getCachedBase(
  db: CacheDb,
  filePath: string,
): CachedBase | undefined {
  const row = db
    .prepare(
      "select path, yaml_json as yamlJson, parse_error as parseError, parsed_at as parsedAt from bases where path = ?",
    )
    .get(filePath) as
    | {
        path: string;
        yamlJson: string | null;
        parseError: string | null;
        parsedAt: string;
      }
    | undefined;

  if (!row) {
    return undefined;
  }

  return {
    path: row.path,
    definition: row.yamlJson
      ? safeJsonParse<BaseDefinition>(row.yamlJson, "bases.yaml_json")
      : null,
    parseError: row.parseError,
    parsedAt: row.parsedAt,
  };
}

export function replaceIndexedFiles(
  db: CacheDb,
  files: ScannedVaultFile[],
): void {
  withTransaction(db, () => {
    resetCache(db);
    upsertIndexedFiles(db, files);
  });
}

export function listCachedFiles(
  db: CacheDb,
  filters: FileListFilters = {},
): CachedVaultFile[] {
  const clauses: string[] = [];
  const values: Record<string, string> = {};

  if (filters.folder !== undefined) {
    clauses.push("folder = @folder");
    values.folder = filters.folder;
  }

  if (filters.ext !== undefined) {
    clauses.push("ext = @ext");
    values.ext = normalizeExt(filters.ext);
  }

  const where = clauses.length > 0 ? ` where ${clauses.join(" and ")}` : "";
  const rows = db
    .prepare(`select * from files${where} order by path asc`)
    .all(values) as DbFileRow[];

  return rows.map(dbFileToCachedFile);
}

export function getCachedFile(
  db: CacheDb,
  filePath: string,
): CachedVaultFile | undefined {
  const row = db.prepare("select * from files where path = ?").get(filePath) as
    | DbFileRow
    | undefined;
  return row ? dbFileToCachedFile(row) : undefined;
}

export function inspectCachedFile(
  db: CacheDb,
  filePath: string,
): FileInspection | undefined {
  const file = getCachedFile(db, filePath);
  if (!file) {
    return undefined;
  }

  const markdownRow = db
    .prepare("select * from markdown where file_path = ?")
    .get(filePath) as DbMarkdownRow | undefined;
  const links = listOutgoingLinks(db, filePath);
  const backlinks = db
    .prepare(
      "select source_path, raw, kind, embedded, target_text, target_path_text, heading, block_id, display, resolved_path, ambiguous_paths_json, unresolved, line, column from links where resolved_path = ? order by source_path, line, column",
    )
    .all(filePath) as DbLinkRow[];

  return {
    file,
    markdown: markdownRow
      ? {
          frontmatter: markdownRow.frontmatter_json
            ? safeJsonParse(markdownRow.frontmatter_json, "frontmatter_json")
            : null,
          body: markdownRow.body_text,
          bodyStartLine: markdownRow.body_start_line,
        }
      : null,
    properties: listProperties(db, filePath),
    tags: listFileTags(db, filePath),
    links,
    backlinks: backlinks.map(dbLinkToCachedLink),
    embeds: links.filter((link) => link.embedded),
    headings: listHeadings(db, filePath),
    blocks: listBlocks(db, filePath),
    parseErrors: file.parseError ? [file.parseError] : [],
  };
}

export function listOutgoingLinks(db: CacheDb, filePath: string): CachedLink[] {
  const rows = db
    .prepare(
      "select source_path, raw, kind, embedded, target_text, target_path_text, heading, block_id, display, resolved_path, ambiguous_paths_json, unresolved, line, column from links where source_path = ? order by line, column, id",
    )
    .all(filePath) as DbLinkRow[];

  return rows.map(dbLinkToCachedLink);
}

export function listBacklinks(db: CacheDb, filePath: string): CachedLink[] {
  const rows = db
    .prepare(
      "select source_path, raw, kind, embedded, target_text, target_path_text, heading, block_id, display, resolved_path, ambiguous_paths_json, unresolved, line, column from links where resolved_path = ? order by source_path, line, column",
    )
    .all(filePath) as DbLinkRow[];

  return rows.map(dbLinkToCachedLink);
}

export function listUnresolvedLinks(db: CacheDb): CachedLink[] {
  const rows = db
    .prepare(
      "select source_path, raw, kind, embedded, target_text, target_path_text, heading, block_id, display, resolved_path, ambiguous_paths_json, unresolved, line, column from links where unresolved = 1 order by source_path, line, column",
    )
    .all() as DbLinkRow[];

  return rows.map(dbLinkToCachedLink);
}

export function listAmbiguousLinks(db: CacheDb): CachedLink[] {
  const rows = db
    .prepare(
      "select source_path, raw, kind, embedded, target_text, target_path_text, heading, block_id, display, resolved_path, ambiguous_paths_json, unresolved, line, column from links where ambiguous_paths_json is not null order by source_path, line, column",
    )
    .all() as DbLinkRow[];

  return rows.map(dbLinkToCachedLink);
}

export function listMentions(db: CacheDb, query: string): CachedLink[] {
  const like = `%${query}%`;
  const rows = db
    .prepare(
      `select source_path, raw, kind, embedded, target_text, target_path_text, heading, block_id, display, resolved_path, ambiguous_paths_json, unresolved, line, column
       from links
       where target_text like ? collate nocase
          or resolved_path like ?
          or target_path_text like ?
       order by source_path, line, column`,
    )
    .all(like, like, like) as DbLinkRow[];

  return rows.map(dbLinkToCachedLink);
}

export function resolveCachedLinks(db: CacheDb): void {
  const files = listCachedFiles(db);
  const exactPath = new Map(files.map((file) => [file.path, file.path]));
  const exactName = groupBy(files, (file) => file.name);
  const basename = groupBy(files, (file) => file.basename);
  const aliases = buildAliasIndex(db);
  const links = db
    .prepare(
      "select id, source_path, raw, kind, target_text, target_path_text, heading, block_id from links order by id",
    )
    .all() as DbLinkResolveRow[];
  const update = db.prepare(`
    update links
    set resolved_path = ?, unresolved = ?, ambiguous_paths_json = ?
    where id = ?
  `);

  withTransaction(db, () => {
    for (const link of links) {
      const resolution = resolveLinkRow(link, {
        exactPath,
        exactName,
        basename,
        aliases,
      });

      update.run(
        resolution.resolvedPath ?? null,
        resolution.unresolved ? 1 : 0,
        resolution.ambiguousPaths.length > 0
          ? JSON.stringify(resolution.ambiguousPaths)
          : null,
        link.id,
      );
    }
  });
}

export function listTagCounts(db: CacheDb): TagCount[] {
  const rows = db
    .prepare(
      "select tag, count(distinct file_path) as count from tags group by tag order by tag",
    )
    .all() as DbTagCountRow[];

  return rows.map((row) => ({
    tag: row.tag,
    count: row.count,
  }));
}

export function listFilesForTag(db: CacheDb, tag: string): TaggedFile[] {
  const rows = db
    .prepare(
      `
        select
          files.path,
          files.name,
          files.basename,
          files.ext,
          files.folder,
          files.kind,
          files.size,
          files.ctime,
          files.mtime,
          files.indexed_at,
          files.parse_error,
          tags.tag,
          tags.source,
          tags.line
        from tags
        join files on files.path = tags.file_path
        where tags.tag = ?
        order by files.path, tags.source, tags.line
      `,
    )
    .all(normalizeTag(tag)) as Array<DbFileRow & DbTagRow>;

  return rows.map((row) => ({
    file: dbFileToCachedFile(row),
    tag: {
      tag: row.tag,
      source: row.source,
      line: row.line,
    },
  }));
}

export function listPropertyCounts(db: CacheDb): PropertyCount[] {
  const rows = db
    .prepare(
      "select name, count(distinct file_path) as count from properties group by name order by name",
    )
    .all() as DbPropertyCountRow[];

  return rows.map((row) => ({
    name: row.name,
    count: row.count,
  }));
}

export function listFileProperties(
  db: CacheDb,
  filePath: string,
): CachedProperty[] | undefined {
  if (!getCachedFile(db, filePath)) {
    return undefined;
  }

  return listProperties(db, filePath);
}

export function listFilesForProperty(
  db: CacheDb,
  propertyName: string,
  propertyValue?: string,
): CachedVaultFile[] {
  let sql: string;
  let params: (string | number | null)[];
  if (propertyValue !== undefined) {
    sql = `
      select f.path, f.name, f.basename, f.ext, f.folder, f.kind, f.size, f.ctime, f.mtime, f.indexed_at, f.parse_error
      from files f
      join properties p on p.file_path = f.path
      where p.name = ? and p.value_json = ?
      order by f.path`;
    params = [propertyName, JSON.stringify(propertyValue)];
  } else {
    sql = `
      select f.path, f.name, f.basename, f.ext, f.folder, f.kind, f.size, f.ctime, f.mtime, f.indexed_at, f.parse_error
      from files f
      join properties p on p.file_path = f.path
      where p.name = ?
      order by f.path`;
    params = [propertyName];
  }

  const rows = db.prepare(sql).all(...params) as DbFileRow[];
  return rows.map(dbFileToCachedFile);
}

export function searchCachedMarkdown(
  db: CacheDb,
  options: SearchOptions,
): SearchResult[] {
  if (options.query) {
    return searchCachedMarkdownFts(db, options);
  }

  const matcher = createSearchMatcher(options);
  const rows = db
    .prepare(
      `
        select
          files.path,
          files.name,
          files.basename,
          files.ext,
          files.folder,
          files.kind,
          files.size,
          files.ctime,
          files.mtime,
          files.indexed_at,
          files.parse_error,
          markdown.body_text,
          markdown.body_start_line,
          markdown.frontmatter_json
        from markdown
        join files on files.path = markdown.file_path
        where files.kind = 'markdown'
        order by files.path
      `,
    )
    .all() as DbSearchRow[];
  const results: SearchResult[] = [];

  for (const row of rows) {
    const file = dbFileToCachedFile(row);
    if (!matchesSearchFilters(db, file, options)) {
      continue;
    }

    const matches = matcher ? findBodyMatches(row, matcher) : [];
    if (matcher && matches.length === 0 && !matchesMetadata(row, matcher)) {
      continue;
    }

    results.push({ file, matches });
  }

  return limitResults(results, options.limit);
}

function searchCachedMarkdownFts(
  db: CacheDb,
  options: SearchOptions,
): SearchResult[] {
  const rows = db
    .prepare(
      `
        select
          files.path,
          files.name,
          files.basename,
          files.ext,
          files.folder,
          files.kind,
          files.size,
          files.ctime,
          files.mtime,
          files.indexed_at,
          files.parse_error,
          markdown.body_text,
          markdown.body_start_line,
          markdown.frontmatter_json,
          bm25(search_index) as rank,
          snippet(search_index, 3, '[', ']', '...', 16) as snippet
        from search_index
        join files on files.path = search_index.file_path
        join markdown on markdown.file_path = search_index.file_path
        where search_index match @query
        order by rank, files.path
      `,
    )
    .all({ query: toFtsQuery(options.query ?? "") }) as DbSearchRow[];
  const matcher = createPlainMatcher(options.query ?? "");
  const results: SearchResult[] = [];

  for (const row of rows) {
    const file = dbFileToCachedFile(row);
    if (!matchesSearchFilters(db, file, options)) {
      continue;
    }

    results.push({
      file,
      matches: findBodyMatches(row, matcher),
      rank: row.rank,
      snippet: row.snippet,
    });
  }

  return limitResults(results, options.limit);
}

export function buildCachedGraph(db: CacheDb): VaultGraph {
  const files = listCachedFiles(db);
  const nodes = files.map((file) => ({ path: file.path, kind: file.kind }));
  const rows = db
    .prepare(
      "select source_path, embedded, resolved_path from links where resolved_path is not null order by source_path, line, column, id",
    )
    .all() as Pick<DbLinkRow, "source_path" | "embedded" | "resolved_path">[];
  const edges: GraphEdge[] = rows.flatMap((row) => {
    if (!row.source_path || !row.resolved_path) {
      return [];
    }

    return [
      {
        source: row.source_path,
        target: row.resolved_path,
        kind: graphEdgeKind(row),
      },
    ];
  });

  return { nodes, edges };
}

export function getCacheStatus(
  db: CacheDb,
  vault: ResolvedVault,
  currentFiles: ScannedVaultFile[],
): CacheStatus {
  const changes = diffCachedFiles(db, currentFiles);

  return {
    vault: vault.root,
    cache: path.join(vault.cacheDir, "index.sqlite"),
    schemaVersion: CACHE_SCHEMA_VERSION,
    parserVersion: PARSER_VERSION,
    files: count(db),
    markdownFiles: count(db, "markdown"),
    baseFiles: count(db, "base"),
    canvasFiles: count(db, "canvas"),
    staleFiles: changes.stale.length,
    deletedFiles: changes.deleted.length,
    lastIndexedAt: lastIndexedAt(db),
  };
}

export function diffCachedFiles(
  db: CacheDb,
  currentFiles: ScannedVaultFile[],
): { stale: ScannedVaultFile[]; deleted: CachedVaultFile[] } {
  const cachedFiles = listCachedFiles(db);
  const currentByPath = new Map(currentFiles.map((file) => [file.path, file]));
  const cachedByPath = new Map(cachedFiles.map((file) => [file.path, file]));
  const stale: ScannedVaultFile[] = [];
  const deleted: CachedVaultFile[] = [];

  for (const cachedFile of cachedFiles) {
    const currentFile = currentByPath.get(cachedFile.path);
    if (!currentFile) {
      deleted.push(cachedFile);
      continue;
    }

    if (isStale(cachedFile, currentFile)) {
      stale.push(currentFile);
    }
  }

  for (const currentFile of currentFiles) {
    if (!cachedByPath.has(currentFile.path)) {
      stale.push(currentFile);
    }
  }

  return { stale, deleted };
}

export function vacuumCache(db: CacheDb): void {
  db.exec("vacuum");
}

function writeMetadata(db: CacheDb): void {
  const setMeta = db.prepare(`
    insert into meta (key, value)
    values (@key, @value)
    on conflict(key) do update set value = excluded.value
  `);

  setMeta.run({ key: "schemaVersion", value: String(CACHE_SCHEMA_VERSION) });
  setMeta.run({ key: "parserVersion", value: PARSER_VERSION });
}

function deleteMarkdownIndex(db: CacheDb, filePath: string): void {
  db.prepare("delete from markdown where file_path = ?").run(filePath);
  db.prepare("delete from search_index where file_path = ?").run(filePath);
  db.prepare("delete from properties where file_path = ?").run(filePath);
  db.prepare("delete from tags where file_path = ?").run(filePath);
  db.prepare("delete from links where source_path = ?").run(filePath);
  db.prepare("delete from headings where file_path = ?").run(filePath);
  db.prepare("delete from blocks where file_path = ?").run(filePath);
}

function deleteBaseIndex(db: CacheDb, filePath: string): void {
  db.prepare("delete from bases where path = ?").run(filePath);
}

function updateParseError(
  db: CacheDb,
  filePath: string,
  parseError: string | null,
): void {
  db.prepare("update files set parse_error = ? where path = ?").run(
    parseError,
    filePath,
  );
}

function validateMetadata(db: CacheDb): void {
  const schemaVersion = readMeta(db, "schemaVersion");
  const parserVersion = readMeta(db, "parserVersion");

  if (schemaVersion === undefined || parserVersion === undefined) {
    if (count(db) === 0) {
      return;
    }

    throw new ObsdxError("CACHE_SCHEMA_MISMATCH", "Cache metadata is missing", {
      expected: {
        schemaVersion: CACHE_SCHEMA_VERSION,
        parserVersion: PARSER_VERSION,
      },
      actual: { schemaVersion, parserVersion },
    });
  }

  if (schemaVersion !== String(CACHE_SCHEMA_VERSION)) {
    throw new ObsdxError(
      "CACHE_SCHEMA_MISMATCH",
      "Cache schema version mismatch",
      {
        expected: CACHE_SCHEMA_VERSION,
        actual: schemaVersion,
      },
    );
  }

  if (parserVersion !== PARSER_VERSION) {
    throw new ObsdxError(
      "CACHE_SCHEMA_MISMATCH",
      "Cache parser version mismatch",
      {
        expected: PARSER_VERSION,
        actual: parserVersion,
      },
    );
  }
}

function readMeta(db: CacheDb, key: string): string | undefined {
  const row = db.prepare("select value from meta where key = ?").get(key) as
    | MetaRow
    | undefined;
  return row?.value;
}

function dbFileToCachedFile(row: DbFileRow): CachedVaultFile {
  return {
    path: row.path,
    name: row.name,
    basename: row.basename,
    ext: row.ext,
    folder: row.folder,
    kind: row.kind,
    size: row.size,
    ctime: row.ctime ?? "",
    mtime: row.mtime ?? "",
    indexedAt: row.indexed_at,
    parseError: row.parse_error,
  };
}

function listProperties(db: CacheDb, filePath: string): CachedProperty[] {
  const rows = db
    .prepare(
      "select name, value_json, value_type from properties where file_path = ? order by rowid",
    )
    .all(filePath) as DbPropertyRow[];

  return rows.map((row) => ({
    name: row.name,
    value: safeJsonParse(row.value_json, "value_json"),
    valueType: row.value_type,
  }));
}

function listFileTags(db: CacheDb, filePath: string): CachedTag[] {
  const rows = db
    .prepare(
      "select tag, source, line from tags where file_path = ? order by tag, source, line",
    )
    .all(filePath) as DbTagRow[];

  return rows.map((row) => ({
    tag: row.tag,
    source: row.source,
    line: row.line,
  }));
}

function createSearchMatcher(
  options: SearchOptions,
): SearchMatcher | undefined {
  if (options.regex) {
    const regex = new RegExp(options.regex, "i");
    return (value) => {
      const match = value.match(regex);
      return match ? { index: match.index ?? null } : undefined;
    };
  }

  if (options.query) {
    return createPlainMatcher(options.query);
  }

  return undefined;
}

function createPlainMatcher(query: string): SearchMatcher {
  const normalized = query.toLowerCase();
  return (value) => {
    const index = value.toLowerCase().indexOf(normalized);
    return index === -1 ? undefined : { index };
  };
}

function findBodyMatches(
  row: DbSearchRow,
  matcher: SearchMatcher,
): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const lines = row.body_text.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const match = matcher(line);
    if (!match) {
      continue;
    }

    matches.push({
      line: row.body_start_line + index,
      column: match.index === null ? null : match.index + 1,
      text: line.trim(),
    });
  }

  return matches;
}

function matchesMetadata(row: DbSearchRow, matcher: SearchMatcher): boolean {
  return Boolean(
    matcher(row.path) ||
      matcher(row.basename) ||
      (row.frontmatter_json && matcher(row.frontmatter_json)),
  );
}

function matchesSearchFilters(
  db: CacheDb,
  file: CachedVaultFile,
  options: SearchOptions,
): boolean {
  if (options.folder !== undefined && file.folder !== options.folder) {
    return false;
  }

  if (options.ext !== undefined && file.ext !== normalizeExt(options.ext)) {
    return false;
  }

  if (options.tag !== undefined && !hasTag(db, file.path, options.tag)) {
    return false;
  }

  if (
    options.property !== undefined &&
    !hasMatchingProperty(db, file.path, options.property)
  ) {
    return false;
  }

  if (
    options.path !== undefined &&
    !file.path.toLowerCase().includes(options.path.toLowerCase())
  ) {
    return false;
  }

  if (options.linksFrom !== undefined && file.path !== options.linksFrom) {
    return false;
  }

  if (
    options.linkedTo !== undefined &&
    !hasResolvedLinkTo(db, file.path, options.linkedTo)
  ) {
    return false;
  }

  return true;
}

function hasTag(db: CacheDb, filePath: string, tag: string): boolean {
  const row = db
    .prepare("select 1 from tags where file_path = ? and tag = ? limit 1")
    .get(filePath, normalizeTag(tag));

  return Boolean(row);
}

function hasMatchingProperty(
  db: CacheDb,
  filePath: string,
  filter: string,
): boolean {
  const eqIndex = filter.indexOf("=");
  if (eqIndex === -1) {
    return false;
  }
  const name = filter.slice(0, eqIndex);
  const expected = filter.slice(eqIndex + 1);

  const row = db
    .prepare(
      "select value_json from properties where file_path = ? and name = ? limit 1",
    )
    .get(filePath, name) as Pick<DbPropertyRow, "value_json"> | undefined;
  if (!row) {
    return false;
  }

  const value = safeJsonParse(row.value_json, "value_json") as unknown;
  if (Array.isArray(value)) {
    return value.map(String).includes(expected);
  }

  return String(value) === expected;
}

function hasResolvedLinkTo(
  db: CacheDb,
  filePath: string,
  targetPath: string,
): boolean {
  const row = db
    .prepare(
      "select 1 from links where source_path = ? and resolved_path = ? limit 1",
    )
    .get(filePath, targetPath);

  return Boolean(row);
}

function toFtsQuery(query: string): string {
  const escaped = query.trim().replace(/"/gu, '""');
  return escaped ? `"${escaped}"` : "";
}

function limitResults(
  results: SearchResult[],
  limit: number | undefined,
): SearchResult[] {
  return limit && limit > 0 ? results.slice(0, limit) : results;
}

function graphEdgeKind(
  row: Pick<DbLinkRow, "embedded" | "resolved_path">,
): GraphEdgeKind {
  if (!row.embedded) {
    return "link";
  }

  return row.resolved_path?.endsWith(".base") ? "base-embed" : "embed";
}

function listHeadings(db: CacheDb, filePath: string): CachedHeading[] {
  const rows = db
    .prepare(
      "select level, text, slug, line from headings where file_path = ? order by line",
    )
    .all(filePath) as DbHeadingRow[];

  return rows;
}

function listBlocks(db: CacheDb, filePath: string): CachedBlock[] {
  const rows = db
    .prepare(
      "select block_id, line from blocks where file_path = ? order by line",
    )
    .all(filePath) as DbBlockRow[];

  return rows.map((row) => ({
    blockId: row.block_id,
    line: row.line,
  }));
}

function dbLinkToCachedLink(row: DbLinkRow): CachedLink {
  return {
    sourcePath: row.source_path ?? null,
    raw: row.raw,
    kind: row.kind,
    embedded: row.embedded === 1,
    targetText: row.target_text,
    targetPathText: row.target_path_text,
    heading: row.heading,
    blockId: row.block_id,
    display: row.display,
    resolvedPath: row.resolved_path,
    unresolved: row.unresolved === 1,
    ambiguousPaths: row.ambiguous_paths_json
      ? safeJsonParse(row.ambiguous_paths_json, "ambiguous_paths_json")
      : [],
    line: row.line,
    column: row.column,
  };
}

type LinkIndexes = {
  exactPath: Map<string, string>;
  exactName: Map<string, string[]>;
  basename: Map<string, string[]>;
  aliases: Map<string, string[]>;
};

function resolveLinkRow(
  link: DbLinkResolveRow,
  indexes: LinkIndexes,
): {
  resolvedPath: string | null;
  ambiguousPaths: string[];
  unresolved: boolean;
} {
  const sourceFolder = path.posix.dirname(link.source_path);
  const target = normalizeTarget(link.target_path_text ?? link.target_text);

  if (isExternalTarget(target)) {
    return {
      resolvedPath: null,
      ambiguousPaths: [],
      unresolved: false,
    };
  }

  const candidates = unique([
    ...pathCandidates(target, sourceFolder, indexes),
    ...(indexes.aliases.get(target) ?? []),
  ]);

  if (candidates.length === 1) {
    return {
      resolvedPath: candidates[0] ?? null,
      ambiguousPaths: [],
      unresolved: false,
    };
  }

  return {
    resolvedPath: null,
    ambiguousPaths: candidates,
    unresolved: candidates.length === 0,
  };
}

function pathCandidates(
  target: string,
  sourceFolder: string,
  indexes: LinkIndexes,
): string[] {
  if (target === "") {
    return [];
  }

  const candidates: string[] = [];
  const targetWithMd = hasExtension(target) ? target : `${target}.md`;
  const relativeTarget =
    sourceFolder === "." ? target : path.posix.join(sourceFolder, target);
  const relativeTargetWithMd = hasExtension(relativeTarget)
    ? relativeTarget
    : `${relativeTarget}.md`;

  for (const candidate of [
    target,
    targetWithMd,
    relativeTarget,
    relativeTargetWithMd,
  ]) {
    const exact = indexes.exactPath.get(candidate);
    if (exact) {
      candidates.push(exact);
    }
  }

  candidates.push(...(indexes.exactName.get(target) ?? []));
  candidates.push(...(indexes.basename.get(target) ?? []));

  return unique(candidates);
}

function buildAliasIndex(db: CacheDb): Map<string, string[]> {
  const rows = db
    .prepare(
      "select file_path, value_json from properties where name = 'aliases'",
    )
    .all() as Array<{ file_path: string; value_json: string }>;
  const aliases = new Map<string, string[]>();

  for (const row of rows) {
    for (const alias of aliasValues(
      safeJsonParse(row.value_json, "value_json"),
    )) {
      const paths = aliases.get(alias) ?? [];
      paths.push(row.file_path);
      aliases.set(alias, paths);
    }
  }

  return aliases;
}

function aliasValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [normalizeTarget(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => aliasValues(item));
  }

  return [];
}

function normalizeTarget(target: string): string {
  return target.trim().replace(/^\/+/, "");
}

function hasExtension(target: string): boolean {
  return path.posix.extname(target) !== "";
}

function isExternalTarget(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target);
}

function groupBy(
  items: Iterable<CachedVaultFile>,
  keyForItem: (item: CachedVaultFile) => string,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const item of items) {
    const key = keyForItem(item);
    const values = grouped.get(key) ?? [];
    values.push(item.path);
    grouped.set(key, values);
  }

  return grouped;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function count(db: CacheDb, kind?: VaultFileKind): number {
  if (!kind) {
    const row = db
      .prepare("select count(*) as count from files")
      .get() as CountRow;
    return row.count;
  }

  const row = db
    .prepare("select count(*) as count from files where kind = ?")
    .get(kind) as CountRow;
  return row.count;
}

function isStale(
  cachedFile: CachedVaultFile,
  scannedFile: ScannedVaultFile,
): boolean {
  return (
    cachedFile.size !== scannedFile.size ||
    cachedFile.mtime !== scannedFile.mtime
  );
}

function lastIndexedAt(db: CacheDb): string | null {
  const row = db
    .prepare("select max(indexed_at) as lastIndexedAt from files")
    .get() as LastIndexedRow;
  return row.lastIndexedAt;
}

function normalizeExt(ext: string): string {
  return ext.startsWith(".") ? ext.slice(1).toLowerCase() : ext.toLowerCase();
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, "");
}

async function writeMetadataFile(vault: ResolvedVault): Promise<void> {
  const metadata: CacheMetadata = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    parserVersion: PARSER_VERSION,
  };

  await writeFile(
    path.join(vault.cacheDir, "meta.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
}

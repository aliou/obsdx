import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { MarkdownIndexInput, ScannedVaultFile } from "@aliou/obsdx-index";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { CacheDb } from "../src/vault/cache";
import {
  ensureSchema,
  listOutgoingLinks,
  replaceMarkdownIndex,
  resolveCachedLinks,
  upsertIndexedFiles,
} from "../src/vault/cache";

// ---------------------------------------------------------------------------
// Shared DB helpers
// ---------------------------------------------------------------------------

let dbDir: string;
function seedFiles(db: CacheDb, files: ScannedVaultFile[]): void {
  upsertIndexedFiles(db, files);
}

/** Insert a markdown file's links via the normal indexer path. */
function seedMarkdown(
  db: CacheDb,
  filePath: string,
  links: Array<{
    raw: string;
    kind: "wikilink" | "markdown";
    targetText: string;
    targetPathText?: string;
    heading?: string | null;
    blockId?: string | null;
    display?: string | null;
    embedded?: boolean;
    line?: number;
    column?: number;
  }>,
): void {
  const input: MarkdownIndexInput = {
    frontmatter: null,
    body: links.map((l) => l.raw).join("\n"),
    bodyStartLine: 1,
    parseError: null,
    properties: [],
    tags: [],
    links: links.map((l) => ({
      raw: l.raw,
      kind: l.kind,
      embedded: l.embedded ?? false,
      targetText: l.targetText,
      targetPathText: l.targetPathText ?? l.targetText,
      heading: l.heading ?? null,
      blockId: l.blockId ?? null,
      display: l.display ?? null,
      line: l.line ?? null,
      column: l.column ?? null,
    })),
    headings: [],
    blocks: [],
  };
  replaceMarkdownIndex(db, filePath, input);
}

function scannedFile(
  overrides: Partial<ScannedVaultFile> & { path: string },
): ScannedVaultFile {
  return {
    name: path.basename(overrides.path),
    basename: path.basename(overrides.path, path.extname(overrides.path)),
    ext: path.extname(overrides.path).slice(1).toLowerCase(),
    folder:
      path.posix.dirname(overrides.path) === "."
        ? ""
        : path.posix.dirname(overrides.path),
    kind: "markdown",
    size: 100,
    ctime: new Date().toISOString(),
    mtime: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// NFC / NFD normalization
// ---------------------------------------------------------------------------

function openDb(): CacheDb {
  const dir = mkdtempSync(path.join(tmpdir(), "obsdx-resolve-"));
  mkdirSync(path.join(dir, ".obsidian"), { recursive: true });
  dbDir = dir;
  const db = new DatabaseSync(path.join(dir, "index.sqlite"));
  ensureSchema(db);
  return db;
}

function closeDb(db: CacheDb): void {
  db.close();
  rmSync(dbDir, { recursive: true, force: true });
}

describe("resolveCachedLinks: NFC/NFD normalization", () => {
  let db: CacheDb;

  beforeAll(() => {
    db = openDb();
  });

  afterAll(() => {
    closeDb(db);
  });

  test("resolves wikilink with NFC é (U+00E9) to file on disk with NFD e+◌́ (U+0065 U+0301)", () => {
    const nfdPath = "People/R\u0065\u0301my.md"; // "Rémy" in NFD
    const nfcTarget = "R\u00e9my"; // "Rémy" in NFC

    seedFiles(db, [
      scannedFile({ path: nfdPath }),
      scannedFile({ path: "Notes/Linker.md" }),
    ]);
    seedMarkdown(db, "Notes/Linker.md", [
      { raw: `[[${nfcTarget}]]`, kind: "wikilink", targetText: nfcTarget },
    ]);
    resolveCachedLinks(db);

    const links = listOutgoingLinks(db, "Notes/Linker.md");
    expect(links).toHaveLength(1);
    expect(links[0]?.resolvedPath).toBe(nfdPath);
    expect(links[0]?.unresolved).toBe(false);
  });

  test("resolves wikilink with NFC ö (U+00F6) to file on disk with NFD o+◌̈ (U+006F U+0308)", () => {
    const nfdPath = "People/G\u006F\u0308ring.md"; // "Göring" in NFD
    const nfcTarget = "G\u00F6ring"; // "Göring" in NFC

    seedFiles(db, [
      scannedFile({ path: nfdPath }),
      scannedFile({ path: "Notes/Ref.md" }),
    ]);
    seedMarkdown(db, "Notes/Ref.md", [
      { raw: `[[${nfcTarget}]]`, kind: "wikilink", targetText: nfcTarget },
    ]);
    resolveCachedLinks(db);

    const links = listOutgoingLinks(db, "Notes/Ref.md");
    expect(links).toHaveLength(1);
    expect(links[0]?.resolvedPath).toBe(nfdPath);
    expect(links[0]?.unresolved).toBe(false);
  });

  test("resolves wikilink with NFD text to NFC filename (reverse direction)", () => {
    // If a file exists with an NFC path (e.g. on a non-macOS filesystem or
    // a path that didn't go through APFS decomposition), a link written in
    // NFD form should still resolve.
    const nfcPath = "People/Na\u00EFve.md"; // "Naïve" in NFC
    const nfdTarget = "Na\u0069\u0308ve"; // "Naïve" in NFD

    seedFiles(db, [
      scannedFile({ path: nfcPath }),
      scannedFile({ path: "Notes/Ref2.md" }),
    ]);
    seedMarkdown(db, "Notes/Ref2.md", [
      { raw: `[[${nfdTarget}]]`, kind: "wikilink", targetText: nfdTarget },
    ]);
    resolveCachedLinks(db);

    const links = listOutgoingLinks(db, "Notes/Ref2.md");
    expect(links).toHaveLength(1);
    expect(links[0]?.resolvedPath).toBe(nfcPath);
    expect(links[0]?.unresolved).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Self-referencing anchor links
// ---------------------------------------------------------------------------

describe("resolveCachedLinks: self-referencing anchor links", () => {
  let db: CacheDb;

  beforeAll(() => {
    db = openDb();
  });

  afterAll(() => {
    closeDb(db);
  });

  test("resolves [text](#fragment) as a self-reference to the source file", () => {
    // Clear previous test data
    db.exec("delete from files");

    seedFiles(db, [scannedFile({ path: "Notes/SelfRef.md" })]);
    seedMarkdown(db, "Notes/SelfRef.md", [
      {
        raw: "[Introduction](#introduction)",
        kind: "markdown",
        targetText: "#introduction",
        targetPathText: "#introduction",
      },
    ]);
    resolveCachedLinks(db);

    const links = listOutgoingLinks(db, "Notes/SelfRef.md");
    expect(links).toHaveLength(1);
    expect(links[0]?.resolvedPath).toBe("Notes/SelfRef.md");
    expect(links[0]?.unresolved).toBe(false);
  });

  test("resolves multiple distinct anchor links within the same file", () => {
    db.exec("delete from files");

    seedFiles(db, [scannedFile({ path: "Notes/Anchors.md" })]);
    seedMarkdown(db, "Notes/Anchors.md", [
      {
        raw: "[Setup](#setup)",
        kind: "markdown",
        targetText: "#setup",
        targetPathText: "#setup",
      },
      {
        raw: "[Usage](#usage)",
        kind: "markdown",
        targetText: "#usage",
        targetPathText: "#usage",
      },
    ]);
    resolveCachedLinks(db);

    const links = listOutgoingLinks(db, "Notes/Anchors.md");
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.resolvedPath === "Notes/Anchors.md")).toBe(
      true,
    );
    expect(links.every((l) => l.unresolved === false)).toBe(true);
  });

  test("resolves [[#heading]] (wikilink with empty path part) as self-reference", () => {
    db.exec("delete from files");

    seedFiles(db, [scannedFile({ path: "Notes/WikiSelf.md" })]);
    seedMarkdown(db, "Notes/WikiSelf.md", [
      {
        raw: "[[#Methods]]",
        kind: "wikilink",
        targetText: "", // empty path part — only heading
        heading: "Methods",
      },
    ]);
    resolveCachedLinks(db);

    const links = listOutgoingLinks(db, "Notes/WikiSelf.md");
    expect(links).toHaveLength(1);
    expect(links[0]?.resolvedPath).toBe("Notes/WikiSelf.md");
    expect(links[0]?.unresolved).toBe(false);
  });

  test("resolves [[#heading]] in a subfolder file", () => {
    db.exec("delete from files");

    seedFiles(db, [scannedFile({ path: "Deep/Nested/Page.md" })]);
    seedMarkdown(db, "Deep/Nested/Page.md", [
      {
        raw: "[[#Overview]]",
        kind: "wikilink",
        targetText: "",
        heading: "Overview",
      },
    ]);
    resolveCachedLinks(db);

    const links = listOutgoingLinks(db, "Deep/Nested/Page.md");
    expect(links).toHaveLength(1);
    expect(links[0]?.resolvedPath).toBe("Deep/Nested/Page.md");
    expect(links[0]?.unresolved).toBe(false);
  });
});

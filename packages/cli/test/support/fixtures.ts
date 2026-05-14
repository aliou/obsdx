import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test as baseTest } from "vitest";
import YAML from "yaml";
import { discoverVault, type ResolvedVault } from "../../src/vault/discover";
import { refreshVaultIndex } from "../../src/vault/indexer";

type WriteVaultFile = (filePath: string, contents: string) => Promise<void>;
type WriteMarkdown = (
  filePath: string,
  frontmatter: Record<string, unknown> | null,
  body: string,
) => Promise<void>;
type WriteBase = (
  filePath: string,
  definition: Record<string, unknown> | string,
) => Promise<void>;
type WriteCanvas = (
  filePath: string,
  document: Record<string, unknown>,
) => Promise<void>;
type OpenDb = () => DatabaseSync;

export const test = baseTest.extend<{
  vaultRoot: string;
  vault: ResolvedVault;
  writeVaultFile: WriteVaultFile;
  writeMarkdown: WriteMarkdown;
  writeBase: WriteBase;
  writeCanvas: WriteCanvas;
  refresh: () => Promise<void>;
  openDb: OpenDb;
}>({
  vaultRoot: async ({ task }, use) => {
    const safeName = task.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
    const vaultRoot = await mkdtemp(path.join(tmpdir(), `obsdx-${safeName}-`));
    await mkdir(path.join(vaultRoot, ".obsidian"), { recursive: true });

    await use(vaultRoot);

    await rm(vaultRoot, { recursive: true, force: true });
  },
  vault: async ({ vaultRoot }, use) => {
    const vault = await discoverVault(vaultRoot);
    await use(vault);
  },
  writeVaultFile: async ({ vaultRoot }, use) => {
    await use(async (filePath, contents) => {
      const absolutePath = path.join(vaultRoot, filePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
    });
  },
  writeMarkdown: async ({ writeVaultFile }, use) => {
    await use(async (filePath, frontmatter, body) => {
      const contents =
        frontmatter === null
          ? body
          : `---\n${YAML.stringify(frontmatter).trimEnd()}\n---\n${body}`;
      await writeVaultFile(filePath, contents);
    });
  },
  writeBase: async ({ writeVaultFile }, use) => {
    await use(async (filePath, definition) => {
      await writeVaultFile(
        filePath,
        typeof definition === "string"
          ? definition
          : YAML.stringify(definition),
      );
    });
  },
  writeCanvas: async ({ writeVaultFile }, use) => {
    await use(async (filePath, document) => {
      await writeVaultFile(filePath, `${JSON.stringify(document)}\n`);
    });
  },
  refresh: async ({ vault }, use) => {
    await use(async () => {
      await refreshVaultIndex(vault, { rebuild: true });
    });
  },
  openDb: async ({ vault }, use) => {
    await use(
      () => new DatabaseSync(path.join(vault.cacheDir, "index.sqlite")),
    );
  },
});

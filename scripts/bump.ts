#!/usr/bin/env tsx

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const PACKAGES = [
  "packages/base-ast",
  "packages/base-engine",
  "packages/cli",
] as const;

type Bump = "major" | "minor" | "patch";

function readVersion(file: string): string {
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  return pkg.version;
}

function writeVersion(file: string, version: string): void {
  const raw = readFileSync(file, "utf8");
  const pkg = JSON.parse(raw);
  pkg.version = version;
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

function bumpVersion(current: string, kind: Bump): string {
  const parts = current.split(".").map(Number);
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) {
    throw new Error(`Invalid semver: ${current}`);
  }
  const [major, minor, patch] = parts;
  switch (kind) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

function usage(): never {
  console.error("Usage: tsx scripts/bump.ts <major|minor|patch>");
  process.exit(1);
}

// --- main ---

const kind = process.argv[2] as Bump | undefined;
if (!kind || !["major", "minor", "patch"].includes(kind)) {
  usage();
}

const rootPkg = resolve(ROOT, "package.json");
const current = readVersion(rootPkg);
const next = bumpVersion(current, kind);

console.log(`Bumping ${current} -> ${next} (${kind})`);

// Write new version to root + all child packages
writeVersion(rootPkg, next);
for (const dir of PACKAGES) {
  writeVersion(resolve(ROOT, dir, "package.json"), next);
}

// Stage the changed files
const files = [
  rootPkg,
  ...PACKAGES.map((d) => resolve(ROOT, d, "package.json")),
]
  .map((f) => resolve(f).replace(`${ROOT}/`, ""))
  .join(" ");
execSync(`git add ${files}`, { cwd: ROOT, stdio: "inherit" });

// Commit
execSync(`git commit -m "chore: release v${next}"`, {
  cwd: ROOT,
  stdio: "inherit",
});

// Tag
execSync(`git tag -a "v${next}" -m "v${next}"`, {
  cwd: ROOT,
  stdio: "inherit",
});

console.log(`Done. Created tag v${next}`);

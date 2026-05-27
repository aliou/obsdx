import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FIXED_PACKAGES = [
  "packages/base-ast/package.json",
  "packages/base-engine/package.json",
  "packages/index/package.json",
];

const versions = FIXED_PACKAGES.map((pkgPath) => {
  const absolutePath = resolve(pkgPath);
  const pkg = JSON.parse(readFileSync(absolutePath, "utf8"));
  return { name: pkg.name, version: pkg.version };
});

const uniqueVersions = [...new Set(versions.map((v) => v.version))];

if (uniqueVersions.length !== 1) {
  console.error("error: fixed packages are version-desynced:");
  for (const v of versions) {
    console.error(`  ${v.name}: ${v.version}`);
  }
  process.exit(1);
}

console.log(`ok: fixed packages synced at ${uniqueVersions[0]}`);

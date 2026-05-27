import { execSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const FIXED = new Set([
  "@aliou/obsdx-base-ast",
  "@aliou/obsdx-base-engine",
  "@aliou/obsdx-index",
]);

const STATUS_PATH = resolve(".changeset/status.json");

try {
  execSync("pnpm changeset status --output=.changeset/status.json", {
    stdio: "inherit",
  });
} catch {
  // changeset status exits non-zero when there are no pending changesets.
  // we still need the file to check, or we exit cleanly if it wasn't created.
  try {
    readFileSync(STATUS_PATH);
  } catch {
    console.log("ok: no pending changesets.");
    process.exit(0);
  }
}

const status = JSON.parse(readFileSync(STATUS_PATH, "utf8"));

try {
  unlinkSync(STATUS_PATH);
} catch {
  // ignore cleanup failure
}

const releases = status.releases?.filter((r) => FIXED.has(r.name)) ?? [];

if (releases.length === 0) {
  console.log("ok: no fixed-package releases planned.");
  process.exit(0);
}

if (releases.length !== FIXED.size) {
  console.error("error: not all fixed packages are in the release plan:");
  for (const r of releases) {
    console.error(`  ${r.name}: ${r.oldVersion} -> ${r.newVersion}`);
  }
  console.error(
    `  missing: ${[...FIXED].filter((n) => !releases.some((r) => r.name === n)).join(", ")}`,
  );
  process.exit(1);
}

const nextVersions = [...new Set(releases.map((r) => r.newVersion))];
if (nextVersions.length !== 1) {
  console.error("error: fixed packages planned for different versions:");
  for (const r of releases) {
    console.error(`  ${r.name}: ${r.oldVersion} -> ${r.newVersion}`);
  }
  process.exit(1);
}

console.log(`ok: fixed release plan valid -> ${nextVersions[0]}`);

#!/usr/bin/env node
/**
 * Run all base accuracy checks from docs/base-accuracy-checks.md
 * Compares obsdx CLI output against Obsidian CLI output for ztesting vault.
 */

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

const VAULT = `${process.env.HOME}/Obsidian/ztesting`;
const OBSDX =
  process.env.OBSDX_BIN ?? path.resolve("packages/cli/dist/obsdx-darwin-arm64");
function obsidianCli(basePath, format = "json") {
  const cmd = `obsidian vault="ztesting" base:query path="${basePath}" format=${format}`;
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 15000 });
  } catch (e) {
    return `ERROR: ${e.message.split("\n")[0]}`;
  }
}

function obsdxCli(basePath) {
  const cmd = `${OBSDX} base query "${basePath}" --vault="${VAULT}" --json --pretty 2>/dev/null`;
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 30000 });
  } catch (e) {
    return `ERROR: ${e.message.split("\n")[0]}`;
  }
}

function parseObsidianOutput(text) {
  if (text.startsWith("ERROR:")) return { error: text };
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function parseObsdxOutput(text) {
  if (text.startsWith("ERROR:")) return { error: text };
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function getObsidianValue(row, name) {
  if (!row || typeof row !== "object") return undefined;
  return row[name];
}

function obsdxColumnAliases(name) {
  const aliases = {
    "file base name": ["file.basename"],
    extension: ["file.ext"],
    path: ["file.path"],
    folder: ["file.folder"],
  };
  return aliases[name] ?? [];
}

function getObsdxValue(result, row, name) {
  if (!row) return undefined;

  const aliases = obsdxColumnAliases(name);
  const columns = Array.isArray(result?.columns) ? result.columns : [];
  const column = columns.find(
    (candidate) =>
      candidate.displayName === name ||
      candidate.id === name ||
      candidate.id === `formula.${name}` ||
      aliases.includes(candidate.id),
  );

  if (column) {
    return (
      row.values?.[column.id] ??
      row.formulas?.[name] ??
      row.formulas?.[column.id?.replace(/^formula\./, "")]
    );
  }

  return (
    row.formulas?.[name] ??
    row.values?.[`formula.${name}`] ??
    row.values?.[name]
  );
}

function renderComparable(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(renderComparable).join(", ");
  if (typeof value === "object") {
    if (typeof value.error === "string") return `Error: ${value.error}`;
    if (typeof value.markdown === "string") return value.markdown;
    if (typeof value.path === "string") return value.path;
    if (typeof value.label === "string") return value.label;
  }
  return String(value);
}

function equivalentValue(name, obsVal, obsdxVal) {
  if (obsVal === obsdxVal) return true;

  // These formulas are intentionally nondeterministic because Obsidian CLI and
  // obsdx run in separate processes at different times.
  if (/random|rand/i.test(name)) return true;
  if (/relative/i.test(name)) return true;

  const obsNumber = Number(obsVal);
  const obsdxNumber = Number(obsdxVal);
  if (Number.isFinite(obsNumber) && Number.isFinite(obsdxNumber)) {
    const diff = Math.abs(obsNumber - obsdxNumber);
    if (/millisecond|milliseconds|ms$/i.test(name)) return diff <= 1000;
    if (/second|seconds/i.test(name)) return diff <= 1;
    if (/minute|minutes/i.test(name)) return diff <= 1 / 60;
    if (/hour|hours|diff/i.test(name)) return diff <= 1 / 3600;
    if (/year|years|month|months/i.test(name)) return diff <= 0.001;
    if (/day|days/i.test(name)) return diff <= 1 / 86_400;
    if (/date|now|time/i.test(name)) return diff <= 1000;
  }

  const obsDate = parseDateTime(obsVal);
  const obsdxDate = parseDateTime(obsdxVal);
  if (obsDate && obsdxDate) {
    return Math.abs(obsDate.valueOf() - obsdxDate.valueOf()) <= 2000;
  }

  return false;
}

function parseDateTime(value) {
  const timeMatch = String(value).match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch) {
    return new Date(
      2000,
      0,
      1,
      Number(timeMatch[1]),
      Number(timeMatch[2]),
      Number(timeMatch[3] ?? 0),
    );
  }

  const match = String(value).match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) return null;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
    Number(match[6] ?? 0),
  );
}

const results = [];

function check(id, description) {
  const basePath = `bases/${id}.base`;
  console.log(`\n=== ${id}: ${description} ===`);

  const obsRaw = obsidianCli(basePath);
  const obsdxRaw = obsdxCli(basePath);
  const obs = parseObsidianOutput(obsRaw);
  const obsdx = parseObsdxOutput(obsdxRaw);

  const result = { id, description, obs, obsdx, issues: [] };

  // Basic row count check
  const obsRows = Array.isArray(obs) ? obs.length : null;
  const obsdxRows = obsdx?.rows?.length ?? null;
  if (obsRows !== null && obsdxRows !== null && obsRows !== obsdxRows) {
    result.issues.push(`Row count: obs=${obsRows} obsdx=${obsdxRows}`);
  }

  if (obs.raw) result.issues.push("obs parse error: non-JSON output");
  if (obsdx.raw) result.issues.push("obsdx parse error: non-JSON output");

  // Compare displayed Obsidian columns against obsdx row values/formulas for Alpha.
  if (Array.isArray(obs) && obsdx?.rows?.length > 0) {
    const obsAlpha = obs.find((r) => r.name === "Alpha");
    const obsdxAlpha = obsdx.rows.find((r) => {
      if (r.file?.basename === "Alpha") return true;
      if (typeof r.file === "string")
        return path.basename(r.file, ".md") === "Alpha";
      return false;
    });

    if (obsAlpha && obsdxAlpha) {
      const columnNames = Object.keys(obsAlpha).filter(
        (k) => k !== "path" && k !== "name",
      );
      for (const name of columnNames) {
        const obsVal = renderComparable(getObsidianValue(obsAlpha, name));
        const obsdxVal = renderComparable(
          getObsdxValue(obsdx, obsdxAlpha, name),
        );
        if (!equivalentValue(name, obsVal, obsdxVal)) {
          result.issues.push(`${name}: obs="${obsVal}" obsdx="${obsdxVal}"`);
        }
      }
    } else {
      result.issues.push("Missing Alpha row in one output");
    }
  }

  if (obs.error) result.issues.push(`obs error: ${obs.error}`);
  if (obsdx.error) result.issues.push(`obsdx error: ${obsdx.error}`);

  const status = result.issues.length === 0 ? "PASS" : "FAIL";
  console.log(`  Status: ${status}`);
  for (const issue of result.issues) {
    console.log(`  ISSUE: ${issue}`);
  }

  results.push(result);
  return result;
}

// Run all checks from the doc
check("test1", "Basic query smoke test");
check("t01_filename", "file.name vs file.basename vs file.ext");
check("t02_today_now", "today() vs now() -- zero time");
check("t03_duration", "Duration fields and duration() parsing");
check("t04_date_arith", "Date arithmetic with duration strings");
check("t05_round", "Number methods: round, floor, ceil, abs, toFixed");
check("t06_string", "String methods");
check("t06b_contains", "string.contains() case sensitivity");
check("t07_list", "List methods and array literals");
check("t07b_list_arity", "list() function accepts only one argument");
check("t08_any", "Any-type methods and object methods");
check("t08b_paren", "Number-literal dot disambiguation");
check(
  "t09_date",
  "Date methods: .date(), .time(), .relative(), .isEmpty(), fields",
);
check("t10_link", "link(), asLink(), asFile(), linksTo()");
check("t11_globals", "Global functions: min, max, empty, not, string, boolean");
check("t12_regex", "Regex literals and .matches()");
check("t13_groupby", "groupBy view structure");
check("t14_sort", "sort in views");
check("t15_summaries", "View summaries (named summary formulas)");
check("t16_custom_summaries", "Top-level summaries section");
check("t17_bracket", "Bracket access note[property]");
check("t18_logic", "&& and || return type");
check("t19_number", "number() on invalid input");
check("t20_date", "date() parsing and fields");
check("t21_note", "note vs property prefix");
check("t22_this", "this keyword");
check(
  "t23_collision",
  "Bare identifier resolution vs global function collision",
);
check("t24_render", "Render functions: escapeHTML, html, image, icon");
check("t25_random", "random() function");
check("t26_format", "date.format() Moment.js pattern support");
check("t27_list_contains", "list.contains() case sensitivity");
check("t28_calendar", "Date + duration fixed-day conversion");
check("t28b_days", "Duration unit-to-day conversion values");
check("t29_dur_named", "Duration named forms");
check("t30_folder", "file.inFolder() filter");

// Summary
console.log("\n\n========== SUMMARY ==========");
const passed = results.filter((r) => r.issues.length === 0).length;
const failed = results.filter((r) => r.issues.length > 0).length;
console.log(`Passed: ${passed}, Failed: ${failed}, Total: ${results.length}`);

if (failed > 0) {
  console.log("\n--- FAILED CHECKS ---");
  for (const r of results.filter((r) => r.issues.length > 0)) {
    console.log(`\n${r.id}: ${r.description}`);
    for (const issue of r.issues) {
      console.log(`  ${issue}`);
    }
  }
}

// Write full results to file
writeFileSync(
  "/tmp/base-accuracy-results.json",
  JSON.stringify(results, null, 2),
);
console.log("\nFull results written to /tmp/base-accuracy-results.json");

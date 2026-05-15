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

function getObsdxColumn(result, name) {
  const columns = Array.isArray(result?.columns) ? result.columns : [];
  const ids = obsdxIdsForObsidianKey(name);
  return columns.find(
    (candidate) =>
      candidate.displayName === name ||
      ids.includes(candidate.id) ||
      candidate.id === name ||
      candidate.id === `formula.${name}`,
  );
}

function getObsdxValue(result, row, name) {
  if (!row || typeof row !== "object") return undefined;

  const column = getObsdxColumn(result, name);
  if (name === "path") return row.file?.path;
  if (name === "name") return row.file?.name;

  const data = row.data && typeof row.data === "object" ? row.data : row;
  if (column) {
    return data[column.id];
  }

  for (const id of obsdxIdsForObsidianKey(name)) {
    if (Object.hasOwn(data, id)) return data[id];
  }

  return data[name] ?? data[`formula.${name}`];
}

function obsdxIdsForObsidianKey(name) {
  const ids = {
    path: ["file.path"],
    name: ["file.name"],
    folder: ["file.folder"],
    extension: ["file.ext"],
    "file base name": ["file.basename"],
  };
  return ids[name] ?? [];
}

function coerceObsidianValue(value, column, obsdxValue) {
  if (value === null || value === undefined) return value;

  if (isPlainObject(obsdxValue) && typeof obsdxValue.error === "string") {
    if (typeof value === "string" && value.startsWith("Error: ")) {
      return { error: value.slice("Error: ".length) };
    }
    return value;
  }

  if (Array.isArray(obsdxValue) && typeof value === "string") {
    if (value === "") return [];
    const items = value.split(/,\s*/u);
    return items.map((item, index) =>
      coerceScalar(item, inferValueType(obsdxValue[index])),
    );
  }

  return coerceScalar(value, column?.type ?? inferValueType(obsdxValue));
}

function coerceScalar(value, type) {
  if (typeof value !== "string") return value;

  if (type === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }

  if (type === "boolean") {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  }

  return value;
}

function inferValueType(value) {
  if (Array.isArray(value)) return "list";
  if (value === null || value === undefined) return undefined;
  if (isPlainObject(value) && typeof value.error === "string") return "error";
  return typeof value;
}

function equivalentValue(name, obsVal, obsdxVal) {
  if (Object.is(obsVal, obsdxVal)) return true;

  // These formulas are intentionally nondeterministic because Obsidian CLI and
  // obsdx run in separate processes at different times.
  if (/random|rand/i.test(name)) return true;
  if (/relative/i.test(name)) return true;

  if (Array.isArray(obsVal) || Array.isArray(obsdxVal)) {
    return (
      Array.isArray(obsVal) &&
      Array.isArray(obsdxVal) &&
      obsVal.length === obsdxVal.length &&
      obsVal.every((item, index) =>
        equivalentValue(`${name}[${index}]`, item, obsdxVal[index]),
      )
    );
  }

  if (isPlainObject(obsVal) || isPlainObject(obsdxVal)) {
    return equivalentObject(name, obsVal, obsdxVal);
  }

  const obsNumber = typeof obsVal === "number" ? obsVal : null;
  const obsdxNumber = typeof obsdxVal === "number" ? obsdxVal : null;
  if (obsNumber !== null && obsdxNumber !== null) {
    const diff = Math.abs(obsNumber - obsdxNumber);
    if (/milli|millisecond|milliseconds|ms$/i.test(name)) return diff <= 1000;
    if (/date|now|time/i.test(name)) return diff <= 1000;
    if (/second|seconds/i.test(name)) return diff <= 1;
    if (/minute|minutes/i.test(name)) return diff <= 1 / 60;
    if (/hour|hours|diff/i.test(name)) return diff <= 1 / 3600;
    if (/year|years|month|months/i.test(name)) return diff <= 0.001;
    if (/day|days/i.test(name)) return diff <= 1 / 86_400;
    return false;
  }

  const obsDate = parseTemporal(obsVal);
  const obsdxDate = parseTemporal(obsdxVal);
  if (obsDate || obsdxDate) {
    return (
      obsDate &&
      obsdxDate &&
      obsDate.kind === obsdxDate.kind &&
      Math.abs(obsDate.date.valueOf() - obsdxDate.date.valueOf()) <= 2000
    );
  }

  return false;
}

function equivalentObject(name, obsVal, obsdxVal) {
  if (!isPlainObject(obsVal) || !isPlainObject(obsdxVal)) return false;
  const obsKeys = Object.keys(obsVal).sort();
  const obsdxKeys = Object.keys(obsdxVal).sort();
  if (!equivalentValue(`${name}.keys`, obsKeys, obsdxKeys)) return false;
  return obsKeys.every((key) =>
    equivalentValue(`${name}.${key}`, obsVal[key], obsdxVal[key]),
  );
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTemporal(value) {
  if (typeof value !== "string") return null;

  const timeMatch = value.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch) {
    return {
      kind: "time",
      date: new Date(
        2000,
        0,
        1,
        Number(timeMatch[1]),
        Number(timeMatch[2]),
        Number(timeMatch[3] ?? 0),
      ),
    };
  }

  const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    return {
      kind: "date",
      date: new Date(
        Number(dateMatch[1]),
        Number(dateMatch[2]) - 1,
        Number(dateMatch[3]),
      ),
    };
  }

  const dateTimeMatch = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!dateTimeMatch) return null;
  return {
    kind: "datetime",
    date: new Date(
      Number(dateTimeMatch[1]),
      Number(dateTimeMatch[2]) - 1,
      Number(dateTimeMatch[3]),
      Number(dateTimeMatch[4]),
      Number(dateTimeMatch[5]),
      Number(dateTimeMatch[6] ?? 0),
    ),
  };
}

function formatIssueValue(value) {
  return JSON.stringify(value);
}

function compareIfPresent(result, label, obsValue, obsdxValue) {
  if (obsValue === undefined || obsdxValue === undefined) return;
  if (!equivalentValue(label, obsValue, obsdxValue)) {
    result.issues.push(
      `${label}: obs=${formatIssueValue(obsValue)} obsdx=${formatIssueValue(obsdxValue)}`,
    );
  }
}

function findComparableRow(rows) {
  return (
    rows.find((row) => {
      if (!row || typeof row !== "object") return false;
      const data = row.data && typeof row.data === "object" ? row.data : row;
      if (row.file?.name === "Alpha") return true;
      if (row.name === "Alpha") return true;
      if (data["file.name"] === "Alpha") return true;
      if (data["file.basename"] === "Alpha") return true;
      if (typeof row.file?.path === "string") {
        return path.basename(row.file.path, ".md") === "Alpha";
      }
      if (typeof row.path === "string")
        return path.basename(row.path, ".md") === "Alpha";
      if (typeof data["file.path"] === "string") {
        return path.basename(data["file.path"], ".md") === "Alpha";
      }
      return false;
    }) ?? rows[0]
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

  compareIfPresent(result, "columns", obs.columns, obsdx?.columns);
  compareIfPresent(result, "meta", obs.meta, obsdx?.meta);

  // Compare displayed Obsidian row fields against obsdx row values.
  if (Array.isArray(obs) && obsdx?.rows?.length > 0) {
    const obsRow = findComparableRow(obs);
    const obsdxRow = findComparableRow(obsdx.rows);

    if (obsRow && obsdxRow) {
      for (const name of Object.keys(obsRow)) {
        const column = getObsdxColumn(obsdx, name);
        const obsVal = getObsidianValue(obsRow, name);
        const obsdxVal = getObsdxValue(obsdx, obsdxRow, name);
        const comparableObsVal = coerceObsidianValue(obsVal, column, obsdxVal);
        if (!equivalentValue(name, comparableObsVal, obsdxVal)) {
          result.issues.push(
            `${name}: obs=${formatIssueValue(obsVal)} comparableObs=${formatIssueValue(comparableObsVal)} obsdx=${formatIssueValue(obsdxVal)}`,
          );
        }
      }
    } else {
      result.issues.push("Missing comparable row in one output");
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
check("t31_tags", "Tags property and file tags");

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

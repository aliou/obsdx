import t from "@bomb.sh/tab";

/**
 * Register the full obsdx command tree with @bomb.sh/tab for shell completion.
 *
 * The structure mirrors the Brocli command tree in ./commands/.
 * When the CLI is invoked as `obsdx complete <shell>` or `obsdx complete -- <args>`,
 * this definition drives completion output.
 *
 * @bomb.sh/tab's matchCommand walks argv word-by-word and looks up
 * space-joined prefixes in its commands Map. So every intermediate
 * parent (e.g. "index", "links") must also be registered as a command,
 * even if it only exists to group subcommands.
 */

// ── Global options (applied to every leaf command) ─────────────────────

function addGlobalOptions(cmd: ReturnType<typeof t.command>): void {
  cmd.option("vault", "Explicit vault root", "V");
  cmd.option("json", "Emit machine-readable JSON");
  cmd.option("pretty", "Pretty-print JSON with --json");
  cmd.option("ndjson", "Emit newline-delimited JSON");
  cmd.option("no-cache", "Bypass cache and scan directly");
  cmd.option("refresh", "Force refresh stale cache entries");
  cmd.option("rebuild-cache", "Rebuild cache before command");
  cmd.option("quiet", "Suppress non-error output");
  cmd.option("verbose", "Emit diagnostic output to stderr");
  cmd.option("lock-timeout", "Milliseconds to wait for cache lock");
}

// ── vault ──────────────────────────────────────────────────────────────

t.command("vault", "Inspect vault metadata");
const vaultInfo = t.command("vault info", "Print resolved vault information");
addGlobalOptions(vaultInfo);

// ── index ──────────────────────────────────────────────────────────────

t.command("index", "Build and inspect the vault cache");

const indexBuild = t.command("index build", "Create or update the vault cache");
addGlobalOptions(indexBuild);

const indexRebuild = t.command("index rebuild", "Clear and rebuild the cache");
addGlobalOptions(indexRebuild);

const indexRefresh = t.command(
  "index refresh",
  "Incrementally refresh the cache",
);
addGlobalOptions(indexRefresh);

const indexStatus = t.command("index status", "Report cache freshness");
addGlobalOptions(indexStatus);

const indexVacuum = t.command("index vacuum", "Vacuum the SQLite cache");
addGlobalOptions(indexVacuum);

const indexWatch = t.command(
  "index watch",
  "Watch vault files and refresh on change",
);
addGlobalOptions(indexWatch);

// ── daemon ─────────────────────────────────────────────────────────────

t.command("daemon", "Manage the background index daemon");

const daemonStart = t.command(
  "daemon start",
  "Start the background index daemon",
);
addGlobalOptions(daemonStart);

const daemonStop = t.command("daemon stop", "Stop the background index daemon");
addGlobalOptions(daemonStop);

const daemonStatus = t.command(
  "daemon status",
  "Check if the daemon is running",
);
addGlobalOptions(daemonStatus);

// ── files ──────────────────────────────────────────────────────────────

t.command("files", "Inspect vault files");

const filesList = t.command("files list", "List vault files");
filesList.option("folder", "Filter by folder");
filesList.option("ext", "Filter by extension");
addGlobalOptions(filesList);

const filesStat = t.command("files stat", "Inspect one vault file");
filesStat.argument("path");
addGlobalOptions(filesStat);

const filesChanged = t.command(
  "files changed",
  "List files changed since last index",
);
addGlobalOptions(filesChanged);

// ── read ───────────────────────────────────────────────────────────────

const readCmd = t.command("read", "Read a vault file");
readCmd.argument("path");
addGlobalOptions(readCmd);

// ── inspect ────────────────────────────────────────────────────────────

const inspectCmd = t.command(
  "inspect",
  "Inspect indexed metadata for a vault file",
);
inspectCmd.argument("path");
addGlobalOptions(inspectCmd);

// ── links ──────────────────────────────────────────────────────────────

t.command("links", "Inspect vault links");

const linksOutgoing = t.command(
  "links outgoing",
  "List outgoing links from a file",
);
linksOutgoing.argument("path");
addGlobalOptions(linksOutgoing);

const linksBacklinks = t.command(
  "links backlinks",
  "List backlinks for a file",
);
linksBacklinks.argument("path");
addGlobalOptions(linksBacklinks);

const linksResolve = t.command(
  "links resolve",
  "Resolve a link from a source file",
);
linksResolve.argument("input");
linksResolve.option("from", "Source file path", "f");
addGlobalOptions(linksResolve);

const linksUnresolved = t.command("links unresolved", "List unresolved links");
addGlobalOptions(linksUnresolved);

const linksAmbiguous = t.command("links ambiguous", "List ambiguous links");
addGlobalOptions(linksAmbiguous);

const linksMentions = t.command(
  "links mentions",
  "Find files that mention a path or text",
);
linksMentions.argument("query");
addGlobalOptions(linksMentions);

// ── search ─────────────────────────────────────────────────────────────

const searchCmd = t.command("search", "Search indexed markdown files");
searchCmd.argument("query");
searchCmd.option("regex", "Regular expression query");
searchCmd.option("folder", "Filter by folder");
searchCmd.option("ext", "Filter by extension");
searchCmd.option("tag", "Filter by tag");
searchCmd.option("property", "Filter by property name or name=value");
searchCmd.option("path", "Filter by path substring");
searchCmd.option("linked-to", "Filter to files linking to a path");
searchCmd.option("links-from", "Filter to one source file path");
searchCmd.option("limit", "Maximum result count");
addGlobalOptions(searchCmd);

// ── base ───────────────────────────────────────────────────────────────

t.command("base", "Inspect and query Obsidian Bases");

const baseList = t.command("base list", "List base files");
addGlobalOptions(baseList);

const baseInspect = t.command("base inspect", "Inspect a base file");
baseInspect.argument("path");
addGlobalOptions(baseInspect);

const baseValidate = t.command("base validate", "Validate a base file");
baseValidate.argument("path");
addGlobalOptions(baseValidate);

const baseViews = t.command("base views", "List views in a base file");
baseViews.argument("path");
addGlobalOptions(baseViews);

const baseQuery = t.command("base query", "Query a base file");
baseQuery.argument("path");
baseQuery.option("view", "View name");
baseQuery.option("context", "Context file path");
addGlobalOptions(baseQuery);

const baseRenderEmbed = t.command(
  "base render-embed",
  "Render Base embeds in a markdown file",
);
baseRenderEmbed.argument("path");
addGlobalOptions(baseRenderEmbed);

// ── graph ──────────────────────────────────────────────────────────────

t.command("graph", "Inspect the resolved vault graph");

const graphExport = t.command("graph export", "Export graph nodes and edges");
addGlobalOptions(graphExport);

const graphNeighborhood = t.command(
  "graph neighborhood",
  "Export a graph neighborhood",
);
graphNeighborhood.argument("path");
graphNeighborhood.option("depth", "Traversal depth");
graphNeighborhood.option("direction", "incoming, outgoing, or both");
addGlobalOptions(graphNeighborhood);

const graphShortestPath = t.command(
  "graph shortest-path",
  "Find the shortest directed path",
);
graphShortestPath.argument("from");
graphShortestPath.argument("to");
addGlobalOptions(graphShortestPath);

const graphComponents = t.command(
  "graph components",
  "List connected graph components",
);
addGlobalOptions(graphComponents);

const graphOrphans = t.command(
  "graph orphans",
  "List files with no graph edges",
);
addGlobalOptions(graphOrphans);

const graphUnresolved = t.command(
  "graph unresolved",
  "List unresolved graph links",
);
addGlobalOptions(graphUnresolved);

// ── canvas ─────────────────────────────────────────────────────────────

t.command("canvas", "Inspect Obsidian Canvas files");

const canvasList = t.command("canvas list", "List canvas files");
addGlobalOptions(canvasList);

const canvasInspect = t.command("canvas inspect", "Inspect a canvas file");
canvasInspect.argument("path");
addGlobalOptions(canvasInspect);

const canvasGraph = t.command(
  "canvas graph",
  "Extract graph edges from a canvas",
);
canvasGraph.argument("path");
addGlobalOptions(canvasGraph);

// ── tags ───────────────────────────────────────────────────────────────

t.command("tags", "Inspect vault tags");

const tagsList = t.command("tags list", "List indexed tags");
tagsList.option("counts", "Include file counts");
addGlobalOptions(tagsList);

const tagsFiles = t.command("tags files", "List files with a tag");
tagsFiles.argument("tag");
addGlobalOptions(tagsFiles);

const tagsTree = t.command("tags tree", "List tags as a nested tree");
addGlobalOptions(tagsTree);

// ── properties ────────────────────────────────────────────────────────

t.command("properties", "Inspect vault properties");

const propertiesList = t.command("properties list", "List indexed properties");
addGlobalOptions(propertiesList);

const propertiesGet = t.command(
  "properties get",
  "Get properties for a vault file",
);
propertiesGet.argument("path");
addGlobalOptions(propertiesGet);

const propertiesFiles = t.command(
  "properties files",
  "List files matching a property",
);
propertiesFiles.option("name", "Property name");
propertiesFiles.option("value", "Property value (optional)");
addGlobalOptions(propertiesFiles);

// ── handler ────────────────────────────────────────────────────────────

export function handleCompletion(argv: string[]): boolean {
  if (argv[2] !== "complete") {
    return false;
  }

  const shell = argv[3];
  if (shell === "--") {
    t.parse(argv.slice(4));
    return true;
  }

  t.setup("obsdx", "obsdx", shell);
  return true;
}

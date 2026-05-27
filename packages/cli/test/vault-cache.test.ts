import { expect } from "vitest";
import {
  inspectIndexedBase,
  listIndexedFilesForProperty,
  queryIndexedBase,
  refreshVaultIndex,
  searchIndexedMarkdown,
} from "../src/vault/indexer";
import { test } from "./support/fixtures";

test("indexes a scoped temporary vault into SQLite", async ({
  writeMarkdown,
  refresh,
  openDb,
}) => {
  await writeMarkdown(
    "Notes/A.md",
    {
      tags: ["project"],
      rating: 7,
      author: ["[[Ada Lovelace]]"],
    },
    "# A\n\nBody #inline/tag with [[B]].\n",
  );
  await writeMarkdown("Notes/B.md", null, "# B\n");
  await refresh();

  const db = openDb();
  try {
    expect(db).toHaveIndexedFile("Notes/A.md", {
      kind: "markdown",
      folder: "Notes",
    });
    expect(db).toHaveIndexedProperty("Notes/A.md", "rating", 7, "number");
    expect(db).toHaveIndexedProperty("Notes/A.md", "author", [
      "[[Ada Lovelace]]",
    ]);
    expect(db).toHaveTag("Notes/A.md", "project");
    expect(db).toHaveTag("Notes/A.md", "inline/tag");
    expect(db).toHaveResolvedLink("Notes/A.md", "[[B]]", "Notes/B.md");
  } finally {
    db.close();
  }
});

test("indexes Base definitions into the persistent cache", async ({
  writeBase,
  refresh,
  openDb,
  vault,
}) => {
  await writeBase("bases/Test.base", {
    views: [{ type: "table", name: "All", order: ["file.name"] }],
  });
  await refresh();

  const db = openDb();
  try {
    const row = db
      .prepare(
        "select yaml_json as yamlJson, parse_error as parseError from bases where path = ?",
      )
      .get("bases/Test.base") as
      | { yamlJson: string | null; parseError: string | null }
      | undefined;

    expect(row?.parseError).toBeNull();
    expect(JSON.parse(row?.yamlJson ?? "{}")).toMatchObject({
      path: "bases/Test.base",
      views: [{ name: "All" }],
    });
  } finally {
    db.close();
  }

  await expect(
    inspectIndexedBase(vault, "bases/Test.base"),
  ).resolves.toMatchObject({
    path: "bases/Test.base",
    views: [{ name: "All" }],
  });
});

test("stores Base parse errors without failing index refresh", async ({
  writeBase,
  vault,
  openDb,
}) => {
  await writeBase("bases/Broken.base", "views: [unterminated");
  await expect(refreshVaultIndex(vault)).resolves.toMatchObject({ indexed: 1 });

  const db = openDb();
  try {
    const row = db
      .prepare(
        "select yaml_json as yamlJson, parse_error as parseError from bases where path = ?",
      )
      .get("bases/Broken.base") as
      | { yamlJson: string | null; parseError: string | null }
      | undefined;

    expect(row?.yamlJson).toBeNull();
    expect(row?.parseError).toContain("Flow sequence in block collection");
  } finally {
    db.close();
  }

  await expect(
    inspectIndexedBase(vault, "bases/Broken.base"),
  ).rejects.toMatchObject({
    code: "BASE_PARSE_ERROR",
  });
});

test("queries a scoped Base with context links", async ({
  writeMarkdown,
  writeBase,
  vault,
}) => {
  await writeMarkdown("wiki/Topic.md", null, "# Topic\n");
  await writeMarkdown(
    "raw/Source.md",
    { wiki: ["[[wiki/Topic]]"], Type: "Article" },
    "Source body\n",
  );
  await writeBase("bases/Sources.base", {
    filters: { and: ['file.inFolder("raw")'] },
    formulas: {
      links_to_this: "wiki.contains(this.file)",
    },
    views: [
      {
        type: "table",
        name: "Sources",
        filters: { and: ["formula.links_to_this == true"] },
        order: ["file.name", "Type"],
      },
    ],
  });

  const result = await queryIndexedBase(vault, "bases/Sources.base", {
    view: "Sources",
    context: "wiki/Topic.md",
  });

  expect(
    result?.rows.map((row) => (row as { file: { path: string } }).file.path),
  ).toEqual(["raw/Source.md"]);
});

test("queries supported Base views from local fixtures", async ({
  writeMarkdown,
  writeBase,
  vault,
}) => {
  await writeMarkdown(
    "References/Kevin Kelly.md",
    { categories: ["[[People]]"] },
    "# Kevin Kelly\n",
  );
  await writeMarkdown(
    "References/Out of Control.md",
    {
      categories: ["[[Books]]"],
      author: ["[[Kevin Kelly]]"],
      genre: ["[[Technology]]", "[[Science]]"],
      rating: 7,
      year: 1992,
      last: "2023-09-12",
    },
    "# Out of Control\n",
  );
  await writeMarkdown(
    "References/The Machine Stops.md",
    {
      categories: ["[[Books]]"],
      author: ["[[E. M. Forster]]"],
      genre: ["[[Fiction]]"],
      rating: 9,
      year: 1909,
      last: "",
    },
    "# The Machine Stops\n",
  );
  await writeMarkdown(
    "Products/Notebook.md",
    {
      categories: ["[[Products]]"],
      maker: "Acme",
      cost: 12,
      uses: 3,
    },
    "# Notebook\n",
  );
  await writeMarkdown("Categories/Books.md", null, "# Books\n");
  await writeMarkdown("Categories/Technology.md", null, "# Technology\n");
  await writeMarkdown("Categories/Products.md", null, "# Products\n");
  await writeBase("bases/Catalog.base", {
    filters: {
      or: [
        'categories.contains(link("Books"))',
        'categories.contains(link("Products"))',
      ],
    },
    formulas: {
      cost_per_use: "cost / uses",
      has_last: "!note.last.isEmpty()",
    },
    properties: {
      "file.name": { displayName: "Name" },
      rating: { displayName: "Rating" },
      "formula.cost_per_use": { displayName: "Cost per use" },
    },
    summaries: {
      RoundedAverage: "values.mean().round(1)",
    },
    views: [
      {
        type: "table",
        name: "Books",
        filters: { and: ['categories.contains(link("Books"))'] },
        order: ["file.name", "author", "genre", "year", "rating", "last"],
        sort: [{ property: "rating", direction: "DESC" }],
        groupBy: { property: "rating", direction: "DESC" },
        summaries: { rating: "RoundedAverage" },
      },
      {
        type: "table",
        name: "Context category",
        filters: { and: ["list(genre).contains(this.file)"] },
        order: ["file.name", "genre"],
      },
      {
        type: "table",
        name: "Products",
        filters: { and: ['categories.contains(link("Products"))'] },
        order: ["file.name", "maker", "formula.cost_per_use"],
      },
    ],
  });
  const books = await queryIndexedBase(vault, "bases/Catalog.base", {
    view: "Books",
  });
  expect(books?.columns.map((column) => column.id)).toEqual([
    "file.name",
    "author",
    "genre",
    "year",
    "rating",
    "last",
  ]);
  expect(books?.rows.map((row) => row.file.path)).toEqual([
    "References/The Machine Stops.md",
    "References/Out of Control.md",
  ]);
  expect(books?.groups).toMatchObject([
    {
      property: "rating",
      direction: "DESC",
      buckets: [
        { value: 9, count: 1 },
        { value: 7, count: 1 },
      ],
    },
  ]);
  expect(books?.summaries).toMatchObject({ count: 2, rating: 8 });

  const context = await queryIndexedBase(vault, "bases/Catalog.base", {
    view: "Context category",
    context: "Categories/Technology.md",
  });
  expect(context?.rows.map((row) => row.file.path)).toEqual([
    "References/Out of Control.md",
  ]);

  const products = await queryIndexedBase(vault, "bases/Catalog.base", {
    view: "Products",
  });
  expect(products?.rows).toMatchObject([
    {
      file: { path: "Products/Notebook.md" },
      values: { "formula.cost_per_use": 4 },
    },
  ]);
});

test("finds files by boolean property value", async ({
  writeMarkdown,
  refresh,
  openDb,
  vault,
}) => {
  await writeMarkdown("notes/active.md", { Discard: true }, "Active note");
  await writeMarkdown("notes/archived.md", { Discard: false }, "Archived note");
  await writeMarkdown(
    "notes/unrelated.md",
    { Status: "active" },
    "Unrelated note",
  );
  await refresh();

  // Verify the DB stores the boolean as JSON true, not JSON "true"
  const db = openDb();
  try {
    expect(db).toHaveIndexedProperty(
      "notes/active.md",
      "Discard",
      true,
      "boolean",
    );
    expect(db).toHaveIndexedProperty(
      "notes/archived.md",
      "Discard",
      false,
      "boolean",
    );
  } finally {
    db.close();
  }

  // listIndexedFilesForProperty with --value "true" should match boolean true
  const filesTrue = await listIndexedFilesForProperty(vault, "Discard", "true");
  expect(filesTrue.map((f) => f.path)).toContain("notes/active.md");

  // listIndexedFilesForProperty with --value "false" should match boolean false
  const filesFalse = await listIndexedFilesForProperty(
    vault,
    "Discard",
    "false",
  );
  expect(filesFalse.map((f) => f.path)).toContain("notes/archived.md");

  // Without --value, all files with the property should be returned
  const allFiles = await listIndexedFilesForProperty(vault, "Discard");
  expect(allFiles.map((f) => f.path)).toEqual([
    "notes/active.md",
    "notes/archived.md",
  ]);
});

test("finds files by numeric property value", async ({
  writeMarkdown,
  refresh,
  openDb,
  vault,
}) => {
  await writeMarkdown(
    "notes/high-priority.md",
    { priority: 1 },
    "High priority",
  );
  await writeMarkdown("notes/low-priority.md", { priority: 3 }, "Low priority");
  await refresh();

  const db = openDb();
  try {
    expect(db).toHaveIndexedProperty(
      "notes/high-priority.md",
      "priority",
      1,
      "number",
    );
  } finally {
    db.close();
  }

  // listIndexedFilesForProperty with --value "1" should match number 1
  const files = await listIndexedFilesForProperty(vault, "priority", "1");
  expect(files.map((f) => f.path)).toContain("notes/high-priority.md");
});

test("searches a scoped temporary vault", async ({ writeMarkdown, vault }) => {
  await writeMarkdown(
    "Notes/Search.md",
    { tags: ["searchable"] },
    "Needle in a local vault.\n",
  );

  const results = await searchIndexedMarkdown(vault, {
    query: "Needle",
    tag: "searchable",
  });

  expect(results.map((result) => result.file.path)).toEqual([
    "Notes/Search.md",
  ]);
  expect(results[0]?.snippet).toContain("[Needle]");
});

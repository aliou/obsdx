import { parseBase } from "@aliou/obsdx-base-ast";
import { describe, expect, it } from "vitest";
import { type BaseFileInspection, queryBase } from "../src";

describe("Base query engine", () => {
  it("evaluates filters, context, sorting, limits, grouping, and summaries", () => {
    const base = parseBase(
      "bases/Sources.base",
      [
        "properties:",
        "  note.title:",
        "  rating:",
        "formulas:",
        "  doubled: rating * 2",
        "views:",
        "  - name: Mentions context",
        "    filters: related.contains(this.file)",
        "    order:",
        "      - note.title",
        "      - rating",
        "      - formula.doubled",
        "    sort:",
        "      - property: rating",
        "        direction: DESC",
        "    limit: 1",
        "    groupBy:",
        "      property: rating",
        "      direction: DESC",
        "    summaries:",
        "      rating: average",
      ].join("\n"),
    );
    const result = queryBase(
      base,
      [contextFile(), sourceFile("A.md", 2), sourceFile("B.md", 5)],
      {
        context: "People/Robin Sloan.md",
        view: "Mentions context",
      },
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows).toMatchObject([
      {
        file: { path: "Sources/B.md" },
        values: {
          "note.title": "B",
          rating: 5,
          "formula.doubled": 10,
        },
      },
    ]);
    expect(result.groups).toEqual([
      {
        property: "rating",
        direction: "DESC",
        buckets: [{ value: 5, count: 1, rows: ["Sources/B.md"] }],
      },
    ]);
    expect(result.summaries).toEqual({
      count: 1,
      rating: 5,
    });
  });

  it("evaluates custom summary formulas", () => {
    const base = parseBase(
      "bases/Summary.base",
      [
        "summaries:",
        "  roundedMean: values.mean().round(1)",
        "views:",
        "  - name: Summary",
        "    order:",
        "      - rating",
        "    summaries:",
        "      rating: roundedMean",
      ].join("\n"),
    );
    const result = queryBase(base, [
      file("A.md", "A", [{ name: "rating", value: 2 }]),
      file("B.md", "B", [{ name: "rating", value: 5 }]),
    ]);

    expect(result.summaries).toEqual({
      count: 2,
      rating: 3.5,
    });
  });

  it("evaluates dependent formulas and null-safe file method chains", () => {
    const base = parseBase(
      "bases/Places.base",
      [
        "formulas:",
        "  Color: list(type)[0].asFile().properties.color",
        "  RelatedCount: formula.Related.length",
        "  Related: list(this.file.links).filter(list(file.links).containsAny(value)).unique()",
        "views:",
        "  - name: Places",
        "    order:",
        "      - formula.Color",
        "      - formula.RelatedCount",
      ].join("\n"),
    );
    const result = queryBase(
      base,
      [
        linkedFile(
          "Categories/Cafes.md",
          "Cafes",
          [],
          [{ name: "color", value: "red" }],
        ),
        linkedFile(
          "Places/No Type.md",
          "No Type",
          ["Categories/Cafes.md"],
          [{ name: "type", value: [] }],
        ),
        linkedFile(
          "Places/Typed.md",
          "Typed",
          ["Categories/Cafes.md"],
          [{ name: "type", value: ["[[Cafes]]"] }],
        ),
      ],
      { context: "Places/Typed.md" },
    );

    expect(result.rows).toMatchObject([
      {
        file: { path: "Categories/Cafes.md" },
        values: { "formula.Color": null, "formula.RelatedCount": 0 },
      },
      {
        file: { path: "Places/No Type.md" },
        values: { "formula.Color": null, "formula.RelatedCount": 1 },
      },
      {
        file: { path: "Places/Typed.md" },
        values: { "formula.Color": "red", "formula.RelatedCount": 1 },
      },
    ]);
  });

  it("evaluates Obsidian date, duration, and empty methods", () => {
    const base = parseBase(
      "bases/People.base",
      [
        "formulas:",
        "  Age: (now() - birthday).years.floor()",
        "views:",
        "  - name: People",
        "    filters:",
        "      and:",
        "        - '!note.last.isEmpty()'",
        "    order:",
        "      - formula.Age",
      ].join("\n"),
    );
    const result = queryBase(base, [
      file("People/With Date.md", "With Date", [
        { name: "birthday", value: "2000-01-01" },
        { name: "last", value: "2025-01-01" },
      ]),
      file("People/Empty.md", "Empty", [
        { name: "birthday", value: null },
        { name: "last", value: "" },
      ]),
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows).toMatchObject([
      {
        file: { path: "People/With Date.md" },
        values: { "formula.Age": expect.any(Number) },
      },
    ]);
  });

  it("exposes documented Obsidian file fields without cache internals", () => {
    const base = parseBase(
      "bases/Books.base",
      [
        "views:",
        "  - name: Books",
        "    order:",
        "      - file.name",
        "      - file.basename",
        "      - file.kind",
        "      - file.indexedAt",
      ].join("\n"),
    );
    const result = queryBase(base, [
      file("References/Out of Control.md", "Out of Control", []),
    ]);

    expect(result.rows).toMatchObject([
      {
        values: {
          "file.name": "Out of Control",
          "file.basename": "Out of Control",
          "file.kind": null,
          "file.indexedAt": null,
        },
      },
    ]);
  });

  it("prefers properties over global functions for bare identifiers", () => {
    const base = parseBase(
      "bases/Meetings.base",
      [
        "views:",
        "  - name: Meetings",
        "    order:",
        "      - date",
        "formulas:",
        '  Parsed: date("2023-09-12").toString()',
      ].join("\n"),
    );
    const result = queryBase(base, [
      file("Notes/Meeting.md", "Meeting", [
        { name: "date", value: "2023-09-12" },
      ]),
    ]);

    expect(result.rows).toMatchObject([
      {
        values: {
          date: "2023-09-12",
        },
        formulas: {
          Parsed: "2023-09-12",
        },
      },
    ]);
  });

  it("evaluates number, duration, file, link functions", () => {
    const base = parseBase(
      "bases/Fns.base",
      [
        "formulas:",
        '  N: number("3.14")',
        '  D: duration("7d").days',
        '  L: link("test").toString()',
        "views:",
        "  - name: Fns",
        "    order:",
        "      - formula.N",
        "      - formula.D",
        "      - formula.L",
      ].join("\n"),
    );
    const result = queryBase(base, [file("Test.md", "Test", [])]);

    expect(result.rows).toMatchObject([
      {
        formulas: {
          N: 3.14,
          D: 7,
          L: "[[test]]",
        },
      },
    ]);
  });

  it("evaluates array containsAll, join, sort methods", () => {
    const base = parseBase(
      "bases/Arr.base",
      [
        "formulas:",
        '  HasAll: tags.containsAll("a", "b")',
        '  Joined: tags.join(" | ")',
        '  Sorted: "[3, 1, 2].sort().join()"',
        "views:",
        "  - name: Arr",
        "    order:",
        "      - formula.HasAll",
        "      - formula.Joined",
        "      - formula.Sorted",
      ].join("\n"),
    );
    const result = queryBase(base, [
      file("A.md", "A", [{ name: "tags", value: ["a", "b", "c"] }]),
      file("B.md", "B", [{ name: "tags", value: ["a"] }]),
    ]);

    const a = result.rows.find((r) => r.file.path === "A.md");
    const b = result.rows.find((r) => r.file.path === "B.md");
    expect(a?.formulas.HasAll).toBe(true);
    expect(a?.formulas.Joined).toBe("#a | #b | #c");
    expect(a?.formulas.Sorted).toBe("1, 2, 3");
    expect(b?.formulas.HasAll).toBe(false);
  });

  it("evaluates string matches and date format methods", () => {
    const base = parseBase(
      "bases/Fmt.base",
      [
        "formulas:",
        "  IsAi: /ai.*/i.matches(file.name)",
        '  Fmt: date("2023-09-12").format("YYYY/MM/DD")',
        "views:",
        "  - name: Fmt",
        "    order:",
        "      - formula.IsAi",
        "      - formula.Fmt",
      ].join("\n"),
    );
    const result = queryBase(base, [
      file("AI Notes.md", "AI Notes", []),
      file("Recipes.md", "Recipes", []),
    ]);

    const ai = result.rows.find((r) => r.file.basename === "AI Notes");
    const recipes = result.rows.find((r) => r.file.basename === "Recipes");
    expect(ai?.formulas.IsAi).toBe(true);
    expect(recipes?.formulas.IsAi).toBe(false);
    expect(ai?.formulas.Fmt).toBe("2023/09/12");
  });
});

function contextFile(): BaseFileInspection {
  return file("People/Robin Sloan.md", "Robin Sloan", []);
}

function sourceFile(path: string, rating: number): BaseFileInspection {
  return file(`Sources/${path}`, path.replace(".md", ""), [
    { name: "related", value: ["[[Robin Sloan]]"] },
    { name: "rating", value: rating },
    { name: "title", value: path.replace(".md", "") },
  ]);
}

function linkedFile(
  path: string,
  basename: string,
  links: string[],
  properties: BaseFileInspection["properties"],
): BaseFileInspection {
  return {
    ...file(path, basename, properties),
    links: links.map((link) => ({ resolvedPath: link, targetText: link })),
  };
}

function file(
  path: string,
  basename: string,
  properties: BaseFileInspection["properties"],
): BaseFileInspection {
  return {
    file: {
      path,
      name: `${basename}.md`,
      basename,
      ext: ".md",
      folder: path.split("/").slice(0, -1).join("/"),
      kind: "markdown",
    },
    properties,
    tags: [],
    links: [],
    backlinks: [],
    embeds: [],
  };
}

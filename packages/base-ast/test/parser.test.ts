import { describe, expect, it } from "vitest";
import {
  expressionUsesThis,
  filterUsesThis,
  formulasUsingThis,
  parseBase,
  parseExpression,
  resolveContextRequirements,
  validateBase,
  viewRequiresContext,
} from "../src";

describe("Base syntax parsing", () => {
  it("parses base YAML into a typed definition", () => {
    const base = parseBase(
      "bases/Sources.base",
      [
        "properties:",
        "  note.title:",
        "    displayName: Title",
        "  file.name:",
        "    displayName: Name",
        "formulas:",
        "  year: date(file.name).year",
        "views:",
        "  - type: table",
        "    name: Sources",
        "    order:",
        "      - note.title",
        "    sort:",
        "      - property: note.title",
        "        direction: DESC",
        "    limit: 10",
      ].join("\n"),
    );

    expect(base.path).toBe("bases/Sources.base");
    expect(base.properties["file.name"]?.displayName).toBe("Name");
    expect(base.properties["note.title"]?.displayName).toBe("Title");
    expect(base.formulas.year).toBe("date(file.name).year");
    expect(base.views[0]?.sort).toEqual([
      { property: "note.title", direction: "DESC" },
    ]);
    expect(validateBase(base)).toEqual([]);
  });

  it("parses formula expressions without runtime dependencies", () => {
    expect(parseExpression("file.tags.contains(this.file)")).toEqual({
      kind: "call",
      callee: {
        kind: "member",
        object: {
          kind: "member",
          object: { kind: "identifier", name: "file" },
          property: "tags",
        },
        property: "contains",
      },
      args: [
        {
          kind: "member",
          object: { kind: "identifier", name: "this" },
          property: "file",
        },
      ],
    });
  });

  it("sets requiresContext on parsed views", () => {
    const base = parseBase(
      "bases/Test.base",
      [
        "formulas:",
        "  links_to_this: wiki.contains(this.file)",
        "views:",
        "  - type: table",
        "    name: WithContext",
        "    order:",
        "      - file.name",
        "      - formula.links_to_this",
        "  - type: table",
        "    name: NoReference",
        "    order:",
        "      - file.name",
      ].join("\n"),
    );

    // Engine eagerly evaluates all formulas for every view,
    // so any this-using formula makes ALL views require context.
    expect(base.views[0]?.requiresContext).toBe(true);
    expect(base.views[1]?.requiresContext).toBe(true);
  });
});

describe("`this` reference detection", () => {
  describe("expressionUsesThis", () => {
    it("detects this.file in an expression", () => {
      expect(expressionUsesThis("this.file")).toBe(true);
      expect(expressionUsesThis("this.file.name")).toBe(true);
    });

    it("detects this without dot (e.g. authors.contains(this))", () => {
      expect(expressionUsesThis("authors.contains(this)")).toBe(true);
      expect(expressionUsesThis("author == this")).toBe(true);
    });

    it("returns false for expressions without this", () => {
      expect(expressionUsesThis("file.name")).toBe(false);
      expect(expressionUsesThis('file.inFolder("raw")')).toBe(false);
    });

    it("does not match this inside string literals", () => {
      // The string literal 'this.file' is not a this reference
      expect(expressionUsesThis('"this.file"')).toBe(false);
    });

    it("does not match this inside regex literals", () => {
      expect(expressionUsesThis("/this\\./")).toBe(false);
    });

    it("returns false for unparseable expressions", () => {
      expect(expressionUsesThis("!!")).toBe(false);
    });
  });

  describe("filterUsesThis", () => {
    it("detects this in a string filter", () => {
      expect(filterUsesThis('this.file.name == "test"')).toBe(true);
      expect(filterUsesThis('file.inFolder("raw")')).toBe(false);
    });

    it("detects this in an array of filters (implicit AND)", () => {
      expect(
        filterUsesThis(['file.inFolder("raw")', "this.file == true"]),
      ).toBe(true);
      expect(
        filterUsesThis([
          'file.inFolder("raw")',
          'categories.contains(link("Books"))',
        ]),
      ).toBe(false);
    });

    it("detects this in and/or/not filter structures", () => {
      expect(
        filterUsesThis({ and: ['file.inFolder("raw")', "this.file == true"] }),
      ).toBe(true);
      expect(
        filterUsesThis({ or: ['file.inFolder("raw")', "this.file == true"] }),
      ).toBe(true);
      expect(filterUsesThis({ not: ["this.file == true"] })).toBe(true);
      expect(filterUsesThis({ and: ['file.inFolder("raw")'] })).toBe(false);
    });
  });

  describe("formulasUsingThis", () => {
    it("identifies formulas that reference this", () => {
      const formulas = {
        links_to_this: "wiki.contains(this.file)",
        cost_per_use: "cost / uses",
        has_last: "!note.last.isEmpty()",
      };
      expect(formulasUsingThis(formulas)).toEqual(new Set(["links_to_this"]));
    });

    it("returns empty set when no formulas use this", () => {
      expect(formulasUsingThis({ cost_per_use: "cost / uses" })).toEqual(
        new Set(),
      );
    });
  });

  describe("viewRequiresContext", () => {
    it("flags a view whose filters reference this", () => {
      const base = {
        filters: undefined,
        formulas: {},
      };
      const view = {
        name: "Test",
        type: "table",
        filters: "list(genre).contains(this.file)",
        requiresContext: false,
        raw: {},
      };
      expect(viewRequiresContext(view, base)).toBe(true);
    });

    it("flags a view when base-level filters reference this", () => {
      const base = {
        filters: 'this.file.name == "test"',
        formulas: {},
      };
      const view = {
        name: "Test",
        type: "table",
        requiresContext: false,
        raw: {},
      };
      expect(viewRequiresContext(view, base)).toBe(true);
    });

    it("flags ALL views when any formula uses this", () => {
      const base = {
        filters: undefined,
        formulas: { links_to_this: "wiki.contains(this.file)" },
      };
      // View that doesn't reference the formula at all still needs context
      // because the engine eagerly evaluates all formulas for every row.
      const view = {
        name: "Test",
        type: "table",
        order: ["file.name"],
        requiresContext: false,
        raw: {},
      };
      expect(viewRequiresContext(view, base)).toBe(true);
    });

    it("does not flag a view with no this usage", () => {
      const base = {
        filters: 'categories.contains(link("Books"))',
        formulas: { cost_per_use: "cost / uses" },
      };
      const view = {
        name: "Test",
        type: "table",
        order: ["file.name", "formula.cost_per_use"],
        requiresContext: false,
        raw: {},
      };
      expect(viewRequiresContext(view, base)).toBe(false);
    });
  });

  describe("resolveContextRequirements", () => {
    it("sets requiresContext on all views when any formula uses this", () => {
      const raw = parseBase(
        "bases/Test.base",
        [
          "formulas:",
          "  links_to_this: wiki.contains(this.file)",
          "views:",
          "  - type: table",
          "    name: WithContext",
          "    order:",
          "      - file.name",
          "      - formula.links_to_this",
          "  - type: table",
          "    name: NoReference",
          "    order:",
          "      - file.name",
        ].join("\n"),
      );

      const resolved = resolveContextRequirements(raw);
      // Both views require context because the engine eagerly
      // evaluates all formulas for every row in every view.
      expect(resolved.views[0]?.requiresContext).toBe(true);
      expect(resolved.views[1]?.requiresContext).toBe(true);
    });

    it("sets requiresContext on all views when base filters use this", () => {
      const raw = parseBase(
        "bases/Test.base",
        [
          "filters:",
          "  and:",
          "    - 'file.inFolder(\"raw\")'",
          "    - 'this.file.name == \"test\"'",
          "views:",
          "  - type: table",
          "    name: View1",
          "  - type: table",
          "    name: View2",
        ].join("\n"),
      );

      const resolved = resolveContextRequirements(raw);
      expect(resolved.views[0]?.requiresContext).toBe(true);
      expect(resolved.views[1]?.requiresContext).toBe(true);
    });

    it("leaves requiresContext false when no this usage", () => {
      const raw = parseBase(
        "bases/Test.base",
        [
          "views:",
          "  - type: table",
          "    name: Simple",
          "    order:",
          "      - file.name",
        ].join("\n"),
      );

      const resolved = resolveContextRequirements(raw);
      expect(resolved.views[0]?.requiresContext).toBe(false);
    });
  });
});

import { describe, expect, it } from "vitest";
import { parseBase, parseExpression, validateBase } from "../src";

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
});

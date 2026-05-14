/**
 * Accuracy tests for base-ast against Obsidian Bases reference behavior.
 *
 * These tests verify parsing and lexing only -- no runtime evaluation.
 * Evaluated behavior is tested in base-engine.
 *
 * Verified against Obsidian 1.12.7 using the `obsidian` CLI against the
 * bases-verification-vault fixture.
 */

import { describe, expect, it } from "vitest";
import { lexExpression, type Token } from "../src/expressions/lexer";
import { parseExpression } from "../src/expressions/parser";
import { parseBase, validateBase } from "../src/parser";

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

describe("Lexer: regex literals", () => {
  it("tokenizes /pattern/ as a regex token", () => {
    const tokens = lexExpression("/^A/");
    expect(tokens).toMatchObject([
      { type: "regex", lexeme: "/^A/", value: { pattern: "^A", flags: "" } },
      { type: "eof" },
    ]);
  });

  it("tokenizes /pattern/flags as a regex token with flags", () => {
    const tokens = lexExpression("/alpha/i");
    expect(tokens).toMatchObject([
      {
        type: "regex",
        lexeme: "/alpha/i",
        value: { pattern: "alpha", flags: "i" },
      },
      { type: "eof" },
    ]);
  });

  it("tokenizes regex with escaped slash /a\\/b/", () => {
    const tokens = lexExpression("/a\\/b/");
    expect(tokens).toMatchObject([
      {
        type: "regex",
        lexeme: "/a\\/b/",
        value: { pattern: "a\\/b", flags: "" },
      },
      { type: "eof" },
    ]);
  });

  it("tokenizes regex with character class /[a/b]/", () => {
    const tokens = lexExpression("/[a/b]/");
    expect(tokens).toMatchObject([
      {
        type: "regex",
        lexeme: "/[a/b]/",
        value: { pattern: "[a/b]", flags: "" },
      },
      { type: "eof" },
    ]);
  });

  it("treats / as division after a value", () => {
    const tokens = lexExpression("1 / 2");
    const lexemes = tokens.map((t: Token) => t.lexeme);
    expect(lexemes).toEqual(["1", "/", "2", ""]);
  });

  it("treats / as regex after an operator", () => {
    const tokens = lexExpression("x == /^A/");
    expect(tokens[2]).toMatchObject({
      type: "regex",
      lexeme: "/^A/",
      value: { pattern: "^A", flags: "" },
    });
  });

  it("treats / as regex after opening paren", () => {
    const tokens = lexExpression("(/^A/)");
    expect(tokens[1]).toMatchObject({
      type: "regex",
      lexeme: "/^A/",
    });
  });

  it("throws on unterminated regex", () => {
    expect(() => lexExpression("/unclosed")).toThrow("Unterminated regex");
  });
});

describe("Lexer: array literal syntax", () => {
  it("tokenizes [1, 2, 3] for array literals", () => {
    const tokens = lexExpression("[1, 2, 3]");
    const types = tokens.map((t: Token) => t.type);
    const lexemes = tokens.map((t: Token) => t.lexeme);
    expect(types).toEqual([
      "punct", // [
      "number", // 1
      "punct", // ,
      "number", // 2
      "punct", // ,
      "number", // 3
      "punct", // ]
      "eof",
    ]);
    expect(lexemes).toEqual(["[", "1", ",", "2", ",", "3", "]", ""]);
  });

  it("tokenizes ['a', 'b'] for string array literals", () => {
    const tokens = lexExpression('["a", "b"]');
    const lexemes = tokens.map((t: Token) => t.lexeme);
    expect(lexemes).toEqual(["[", '"a"', ",", '"b"', "]", ""]);
  });

  it("tokenizes nested array [[1, 2], 3]", () => {
    const tokens = lexExpression("[[1, 2], 3]");
    const lexemes = tokens.map((t: Token) => t.lexeme);
    expect(lexemes).toEqual(["[", "[", "1", ",", "2", "]", ",", "3", "]", ""]);
  });
});

describe("Lexer: number followed by dot-method", () => {
  it("lexes (1).isTruthy() without consuming dot into number", () => {
    const tokens = lexExpression("(1).isTruthy()");
    const lexemes = tokens.map((t: Token) => t.lexeme);
    expect(lexemes).toEqual(["(", "1", ")", ".", "isTruthy", "(", ")", ""]);
  });

  it("lexes 1.isTruthy() as number then dot then identifier", () => {
    const tokens = lexExpression("1.isTruthy()");
    const lexemes = tokens.map((t: Token) => t.lexeme);
    expect(lexemes).toEqual(["1", ".", "isTruthy", "(", ")", ""]);
  });
});

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

describe("Parser: array literal expressions", () => {
  it("parses [1, 2, 3] as an array expression", () => {
    const ast = parseExpression("[1, 2, 3]");
    expect(ast).toEqual({
      kind: "array",
      elements: [
        { kind: "literal", value: 1 },
        { kind: "literal", value: 2 },
        { kind: "literal", value: 3 },
      ],
    });
  });

  it("parses [] as an empty array", () => {
    const ast = parseExpression("[]");
    expect(ast).toEqual({ kind: "array", elements: [] });
  });

  it("parses nested array [[1, 2], 3]", () => {
    const ast = parseExpression("[[1, 2], 3]");
    expect(ast).toEqual({
      kind: "array",
      elements: [
        {
          kind: "array",
          elements: [
            { kind: "literal", value: 1 },
            { kind: "literal", value: 2 },
          ],
        },
        { kind: "literal", value: 3 },
      ],
    });
  });

  it("parses property[0] as index access", () => {
    const ast = parseExpression("property[0]");
    expect(ast).toEqual({
      kind: "index",
      object: { kind: "identifier", name: "property" },
      index: { kind: "literal", value: 0 },
    });
  });

  it('parses note["price"] as index access with string key', () => {
    const ast = parseExpression('note["price"]');
    expect(ast).toEqual({
      kind: "index",
      object: { kind: "identifier", name: "note" },
      index: { kind: "literal", value: "price" },
    });
  });
});

describe("Parser: regex literal expressions", () => {
  it("parses /^A/ as a regex expression", () => {
    const ast = parseExpression("/^A/");
    expect(ast).toEqual({ kind: "regex", pattern: "^A", flags: "" });
  });

  it("parses /alpha/i as a regex expression with flags", () => {
    const ast = parseExpression("/alpha/i");
    expect(ast).toEqual({ kind: "regex", pattern: "alpha", flags: "i" });
  });

  it("parses /^A/.matches(file.basename) as member access on regex", () => {
    const ast = parseExpression("/^A/.matches(file.basename)");
    expect(ast).toEqual({
      kind: "call",
      callee: {
        kind: "member",
        object: { kind: "regex", pattern: "^A", flags: "" },
        property: "matches",
      },
      args: [
        {
          kind: "member",
          object: { kind: "identifier", name: "file" },
          property: "basename",
        },
      ],
    });
  });
});

describe("Parser: list() single-argument semantics", () => {
  it("parses list(3, 1, 2) as a call with 3 args (our parser allows this)", () => {
    // In Obsidian, list() takes exactly ONE argument.
    // Our parser doesn't enforce arg count -- it's a runtime concern.
    // But the AST is valid: list called with 3 args.
    const ast = parseExpression("list(3, 1, 2)");
    expect(ast).toEqual({
      kind: "call",
      callee: { kind: "identifier", name: "list" },
      args: [
        { kind: "literal", value: 3 },
        { kind: "literal", value: 1 },
        { kind: "literal", value: 2 },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// YAML parsing (parser.ts)
// ---------------------------------------------------------------------------

describe("YAML parser: groupBy", () => {
  it("parses groupBy with property and direction", () => {
    const base = parseBase(
      "bases/t13.base",
      [
        "views:",
        "  - type: table",
        "    name: ByStatus",
        "    groupBy:",
        "      property: status",
        "      direction: ASC",
        "    order:",
        "      - file.name",
      ].join("\n"),
    );

    expect(base.views[0]?.groupBy).toEqual({
      property: "status",
      direction: "ASC",
    });
  });

  it("parses groupBy with default direction ASC", () => {
    const base = parseBase(
      "bases/t13b.base",
      [
        "views:",
        "  - type: table",
        "    name: ByPriority",
        "    groupBy:",
        "      property: priority",
        "    order:",
        "      - file.name",
      ].join("\n"),
    );

    expect(base.views[0]?.groupBy).toEqual({
      property: "priority",
      direction: "ASC",
    });
  });

  it("parses groupBy with DESC direction", () => {
    const base = parseBase(
      "bases/t13c.base",
      [
        "views:",
        "  - type: table",
        "    name: ByPriority",
        "    groupBy:",
        "      property: priority",
        "      direction: DESC",
        "    order:",
        "      - file.name",
      ].join("\n"),
    );

    expect(base.views[0]?.groupBy).toEqual({
      property: "priority",
      direction: "DESC",
    });
  });
});

describe("YAML parser: top-level summaries", () => {
  it("parses top-level summaries section", () => {
    const base = parseBase(
      "bases/t16.base",
      [
        "summaries:",
        "  customAvg: 'values.mean().round(3)'",
        "views:",
        "  - type: table",
        "    name: Test",
      ].join("\n"),
    );

    expect(base.summaries).toEqual({
      customAvg: "values.mean().round(3)",
    });
  });

  it("returns undefined summaries when not present", () => {
    const base = parseBase(
      "bases/no-sum.base",
      ["views:", "  - type: table", "    name: Test"].join("\n"),
    );

    expect(base.summaries).toBeUndefined();
  });
});

describe("YAML parser: validation", () => {
  it("reports errors for missing view name", () => {
    const base = parseBase(
      "bases/bad.base",
      ["views:", "  - type: table"].join("\n"),
    );

    const errors = validateBase(base);
    expect(errors).toContain("views[0].name is required");
  });

  it("defaults missing view type to 'table' (no validation error)", () => {
    const base = parseBase(
      "bases/bad.base",
      ["views:", "  - name: Test"].join("\n"),
    );

    expect(base.views[0]?.type).toBe("table");
    const errors = validateBase(base);
    expect(errors).not.toContain("views[0].type is required");
  });
});

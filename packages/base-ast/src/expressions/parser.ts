import type { Expr } from "./ast";
import { lexExpression, type Token } from "./lexer";

const PRECEDENCE = new Map([
  ["||", 1],
  ["&&", 2],
  ["==", 3],
  ["!=", 3],
  ["<", 4],
  ["<=", 4],
  [">", 4],
  [">=", 4],
  ["+", 5],
  ["-", 5],
  ["*", 6],
  ["/", 6],
  ["%", 6],
]);

export function parseExpression(source: string): Expr {
  return new Parser(lexExpression(source)).parse();
}

class Parser {
  #current = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Expr {
    const expression = this.parseExpression(0);
    this.consume("eof");
    return expression;
  }

  private parseExpression(minPrecedence: number): Expr {
    let left = this.parsePrefix();

    while (this.peek().type === "operator") {
      const operator = this.peek().lexeme;
      const precedence = PRECEDENCE.get(operator);
      if (precedence === undefined || precedence < minPrecedence) {
        break;
      }

      this.advance();
      const right = this.parseExpression(precedence + 1);
      left = { kind: "binary", left, operator, right };
    }

    return left;
  }

  private parsePrefix(): Expr {
    if (this.match("operator", "!")) {
      return { kind: "unary", operator: "!", right: this.parsePrefix() };
    }

    if (this.match("operator", "-")) {
      return { kind: "unary", operator: "-", right: this.parsePrefix() };
    }

    return this.parsePostfix(this.parsePrimary());
  }

  private parsePrimary(): Expr {
    const token = this.advance();

    if (token.type === "number" || token.type === "string") {
      return { kind: "literal", value: token.value };
    }

    if (token.type === "regex") {
      const value = token.value as { pattern: string; flags: string };
      return { kind: "regex", pattern: value.pattern, flags: value.flags };
    }

    if (token.type === "identifier") {
      if (token.lexeme === "true") {
        return { kind: "literal", value: true };
      }
      if (token.lexeme === "false") {
        return { kind: "literal", value: false };
      }
      if (token.lexeme === "null") {
        return { kind: "literal", value: null };
      }
      return { kind: "identifier", name: token.lexeme };
    }

    // Array literal: [expr, expr, ...]
    if (token.type === "punct" && token.lexeme === "[") {
      const elements: Expr[] = [];
      if (!this.check("punct", "]")) {
        do {
          elements.push(this.parseExpression(0));
        } while (this.match("punct", ","));
      }
      this.consume("punct", "]");
      return { kind: "array", elements };
    }

    if (token.type === "punct" && token.lexeme === "(") {
      const expression = this.parseExpression(0);
      this.consume("punct", ")");
      return expression;
    }

    throw new Error(`Expected expression near "${token.lexeme}"`);
  }

  private parsePostfix(expression: Expr): Expr {
    let current = expression;

    while (true) {
      if (this.match("punct", ".")) {
        const property = this.consume("identifier").lexeme;
        current = { kind: "member", object: current, property };
        continue;
      }

      if (this.match("punct", "[")) {
        const index = this.parseExpression(0);
        this.consume("punct", "]");
        current = { kind: "index", object: current, index };
        continue;
      }

      if (this.match("punct", "(")) {
        const args: Expr[] = [];
        if (!this.check("punct", ")")) {
          do {
            args.push(this.parseExpression(0));
          } while (this.match("punct", ","));
        }
        this.consume("punct", ")");
        current = { kind: "call", callee: current, args };
        continue;
      }

      return current;
    }
  }

  private match(type: Token["type"], lexeme?: string): boolean {
    if (!this.check(type, lexeme)) {
      return false;
    }
    this.advance();
    return true;
  }

  private consume(type: Token["type"], lexeme?: string): Token {
    if (!this.check(type, lexeme)) {
      throw new Error(
        `Expected ${lexeme ?? type}, got "${this.peek().lexeme}"`,
      );
    }

    return this.advance();
  }

  private check(type: Token["type"], lexeme?: string): boolean {
    const token = this.peek();
    return (
      token.type === type && (lexeme === undefined || token.lexeme === lexeme)
    );
  }

  private advance(): Token {
    const token = this.peek();
    this.#current += 1;
    return token;
  }

  private peek(): Token {
    return this.tokens[this.#current] ?? { type: "eof", lexeme: "" };
  }
}

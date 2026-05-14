export type TokenType =
  | "identifier"
  | "number"
  | "string"
  | "regex"
  | "operator"
  | "punct"
  | "eof";

export type Token = {
  type: TokenType;
  lexeme: string;
  value?: unknown;
};

const OPERATORS = ["==", "!=", "<=", ">=", "&&", "||"] as const;
const SINGLE = new Set(["!", "<", ">", "+", "-", "*", "%"]);
const PUNCT = new Set(["(", ")", "[", "]", ".", ","]);

export function lexExpression(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index] ?? "";
    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }

    const two = source.slice(index, index + 2);
    if (OPERATORS.includes(two as (typeof OPERATORS)[number])) {
      tokens.push({ type: "operator", lexeme: two });
      index += 2;
      continue;
    }

    if (SINGLE.has(char)) {
      tokens.push({ type: "operator", lexeme: char });
      index += 1;
      continue;
    }

    if (PUNCT.has(char)) {
      tokens.push({ type: "punct", lexeme: char });
      index += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      const parsed = readString(source, index, char);
      tokens.push({ type: "string", lexeme: parsed.raw, value: parsed.value });
      index = parsed.next;
      continue;
    }

    // Regex literal vs division disambiguation:
    // / is a regex start when we expect an operand (beginning of expression,
    // after an operator, or after opening/separator punctuation).
    // Otherwise / is the division operator.
    if (char === "/") {
      if (expectsOperand(tokens[tokens.length - 1])) {
        const parsed = readRegex(source, index);
        tokens.push({
          type: "regex",
          lexeme: parsed.raw,
          value: parsed.value,
        });
        index = parsed.next;
        continue;
      }

      tokens.push({ type: "operator", lexeme: "/" });
      index += 1;
      continue;
    }

    if (/\d/u.test(char)) {
      const match = source.slice(index).match(/^\d+(?:\.\d+)?/u);
      if (match) {
        tokens.push({
          type: "number",
          lexeme: match[0],
          value: Number(match[0]),
        });
        index += match[0].length;
        continue;
      }
    }

    if (/[A-Za-z_]/u.test(char)) {
      const match = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_-]*/u);
      if (match) {
        tokens.push({ type: "identifier", lexeme: match[0] });
        index += match[0].length;
        continue;
      }
    }

    throw new Error(`Unexpected token near "${source.slice(index)}"`);
  }

  tokens.push({ type: "eof", lexeme: "" });
  return tokens;
}

/**
 * Returns true if the previous token implies the next token should be
 * an operand (value), making a leading `/` a regex literal rather than
 * the division operator.
 */
function expectsOperand(prev?: Token): boolean {
  if (!prev || prev.type === "eof") return true;
  if (prev.type === "operator") return true;
  if (prev.type === "punct") {
    return prev.lexeme === "(" || prev.lexeme === "[" || prev.lexeme === ",";
  }
  return false;
}

function readRegex(
  source: string,
  start: number,
): { raw: string; value: { pattern: string; flags: string }; next: number } {
  let index = start + 1; // skip opening /
  let pattern = "";
  let inCharClass = false;

  while (index < source.length) {
    const char = source[index] ?? "";

    if (char === "\\") {
      // Escaped character inside regex -- consume both the backslash and
      // the following character so \/ does not terminate the pattern.
      pattern += source.slice(index, index + 2);
      index += 2;
      continue;
    }

    if (char === "[") {
      inCharClass = true;
      pattern += char;
      index += 1;
      continue;
    }

    if (char === "]" && inCharClass) {
      inCharClass = false;
      pattern += char;
      index += 1;
      continue;
    }

    if (char === "/" && !inCharClass) {
      // Closing delimiter found.
      const raw = source.slice(start, index + 1);

      // Read optional flags after the closing /.
      const flagStart = index + 1;
      const flagMatch = source.slice(flagStart).match(/^[gimsuy]*/u);
      const flags = flagMatch?.[0] ?? "";

      return {
        raw: raw + flags,
        value: { pattern, flags },
        next: flagStart + flags.length,
      };
    }

    pattern += char;
    index += 1;
  }

  throw new Error("Unterminated regex literal");
}

function readString(
  source: string,
  start: number,
  quote: string,
): { raw: string; value: string; next: number } {
  let value = "";
  let index = start + 1;

  while (index < source.length) {
    const char = source[index] ?? "";
    if (char === quote) {
      return {
        raw: source.slice(start, index + 1),
        value,
        next: index + 1,
      };
    }

    if (char === "\\") {
      value += source[index + 1] ?? "";
      index += 2;
      continue;
    }

    value += char;
    index += 1;
  }

  throw new Error("Unterminated string literal");
}

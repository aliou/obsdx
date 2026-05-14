export type Expr =
  | { kind: "literal"; value: unknown }
  | { kind: "regex"; pattern: string; flags: string }
  | { kind: "array"; elements: Expr[] }
  | { kind: "identifier"; name: string }
  | { kind: "member"; object: Expr; property: string }
  | { kind: "index"; object: Expr; index: Expr }
  | { kind: "call"; callee: Expr; args: Expr[] }
  | { kind: "unary"; operator: "!" | "-"; right: Expr }
  | { kind: "binary"; left: Expr; operator: string; right: Expr };

export type FilterNode =
  | { op: "expr"; expression: unknown }
  | { op: "and"; children: FilterNode[] }
  | { op: "or"; children: FilterNode[] }
  | { op: "not"; children: FilterNode[] };

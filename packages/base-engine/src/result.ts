export type BaseQueryResult = {
  base: string;
  view?: string;
  context?: string;
  columns: unknown[];
  rows: unknown[];
  groups: unknown[];
  summaries: Record<string, unknown>;
};

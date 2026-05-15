import type { BaseColumn } from "./query";

export type BaseQueryMeta = {
  type?: string;
  name?: string;
  filters?: unknown;
  order: string[];
  sort?: unknown[];
  limit?: number;
  groupBy?: unknown;
  summaries?: Record<string, unknown>;
};

export type BaseQueryRow = {
  file: {
    path: string;
    name: string;
  };
  data: Record<string, unknown>;
};

export type BaseQueryResult = {
  base: string;
  view?: string;
  context?: string;
  meta: BaseQueryMeta;
  columns: BaseColumn[];
  rows: BaseQueryRow[];
  groups: unknown[];
  summaries: Record<string, unknown>;
};

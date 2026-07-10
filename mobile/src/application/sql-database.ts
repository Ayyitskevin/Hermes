export type SqlPrimitive = string | number | null | Uint8Array;
export type SqlParameters = readonly SqlPrimitive[];

export interface SqlRunResult {
  readonly changes: number;
  readonly lastId?: number;
}

export interface SqlRow {
  readonly [column: string]: unknown;
}

export interface SqlDatabase {
  execute(statement: string): Promise<SqlRunResult>;
  run(statement: string, values?: SqlParameters): Promise<SqlRunResult>;
  query<Row extends SqlRow>(statement: string, values?: SqlParameters): Promise<readonly Row[]>;
  transaction<Result>(operation: () => Promise<Result>): Promise<Result>;
  close(): Promise<void>;
}

export interface JournalDatabaseFactory {
  open(): Promise<SqlDatabase>;
}

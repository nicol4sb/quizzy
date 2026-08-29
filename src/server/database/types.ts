import type { Pool } from "pg";

export type Database = Pick<Pool, "query" | "connect">;

import type { Database } from "../database/types.js";
import { hashSessionToken } from "./session.js";

export type Creator = { id: string; email: string; created_at: Date };

export async function findCurrentCreator(
  database: Database,
  token: string | undefined,
): Promise<Creator | undefined> {
  if (!token) return undefined;
  const result = await database.query<Creator>(
    `SELECT c.id, c.email, c.created_at
       FROM creator_sessions s
       JOIN creators c ON c.id = s.creator_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashSessionToken(token)],
  );
  return result.rows[0];
}

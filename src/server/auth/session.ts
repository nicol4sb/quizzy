import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";

export const sessionCookieName = "quizzy_session";
export const sessionLifetimeSeconds = 7 * 24 * 60 * 60;

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  pool: Pick<Pool, "query">,
  creatorId: string,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO creator_sessions (id, creator_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + ($4 * interval '1 second'))`,
    [randomUUID(), creatorId, hashSessionToken(token), sessionLifetimeSeconds],
  );
  return token;
}

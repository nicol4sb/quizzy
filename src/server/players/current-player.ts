import type { Database } from "../database/types.js";
import { hashPlayerToken } from "./token.js";

export type CurrentPlayer = {
  id: string;
  live_session_id: string;
  nickname: string;
};

export function bearerToken(authorization: string | undefined) {
  const match = authorization?.match(/^Bearer (.+)$/i);
  return match?.[1];
}

export async function findCurrentPlayer(
  database: Database,
  sessionId: string,
  token: string | undefined,
): Promise<CurrentPlayer | undefined> {
  if (!token) return undefined;
  const result = await database.query<CurrentPlayer>(
    `SELECT id, live_session_id, nickname
       FROM players
      WHERE live_session_id = $1 AND token_hash = $2`,
    [sessionId, hashPlayerToken(token)],
  );
  return result.rows[0];
}

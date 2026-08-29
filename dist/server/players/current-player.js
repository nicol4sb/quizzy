import { hashPlayerToken } from "./token.js";
export function bearerToken(authorization) {
    const match = authorization?.match(/^Bearer (.+)$/i);
    return match?.[1];
}
export async function findCurrentPlayer(database, sessionId, token) {
    if (!token)
        return undefined;
    const result = await database.query(`SELECT id, live_session_id, nickname
       FROM players
      WHERE live_session_id = $1 AND token_hash = $2`, [sessionId, hashPlayerToken(token)]);
    return result.rows[0];
}
//# sourceMappingURL=current-player.js.map
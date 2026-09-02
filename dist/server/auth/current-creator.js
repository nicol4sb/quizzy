import { hashSessionToken } from "./session.js";
export async function findCurrentCreator(database, token) {
    if (!token)
        return undefined;
    const result = await database.query(`SELECT c.id, c.email, c.is_admin, c.created_at
       FROM creator_sessions s
       JOIN creators c ON c.id = s.creator_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`, [hashSessionToken(token)]);
    return result.rows[0];
}
//# sourceMappingURL=current-creator.js.map
export async function answerProgress(database, sessionId, roundId) {
    const result = await database.query(`SELECT
       (SELECT count(*)::integer FROM answer_submissions WHERE question_round_id = $2) AS "answeredCount",
       (SELECT count(*)::integer FROM players WHERE live_session_id = $1) AS "totalPlayers"`, [sessionId, roundId]);
    return result.rows[0];
}
//# sourceMappingURL=answer-progress.js.map
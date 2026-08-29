import type { Database } from "../database/types.js";

export type AnswerProgress = { answeredCount: number; totalPlayers: number };

export async function answerProgress(
  database: Database,
  sessionId: string,
  roundId: string,
): Promise<AnswerProgress> {
  const result = await database.query<AnswerProgress>(
    `SELECT
       (SELECT count(*)::integer FROM answer_submissions WHERE question_round_id = $2) AS "answeredCount",
       (SELECT count(*)::integer FROM players WHERE live_session_id = $1) AS "totalPlayers"`,
    [sessionId, roundId],
  );
  return result.rows[0]!;
}

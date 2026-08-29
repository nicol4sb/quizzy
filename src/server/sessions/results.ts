import type { Database } from "../database/types.js";
import { currentQuestion, type PublicQuestion } from "./current-question.js";

type LeaderboardRow = {
  id: string;
  nickname: string;
  score: number;
  correct_answers: number;
  joined_at: Date;
};

export type LeaderboardEntry = {
  rank: number;
  playerId: string;
  nickname: string;
  score: number;
  correctAnswers: number;
};

export async function leaderboard(
  database: Database,
  sessionId: string,
): Promise<LeaderboardEntry[]> {
  const result = await database.query<LeaderboardRow>(
    `SELECT p.id, p.nickname, p.joined_at,
            COALESCE(sum(a.points_awarded), 0)::integer AS score,
            count(a.id) FILTER (WHERE a.is_correct)::integer AS correct_answers
       FROM players p
       LEFT JOIN answer_submissions a ON a.player_id = p.id
      WHERE p.live_session_id = $1
      GROUP BY p.id, p.nickname, p.joined_at
      ORDER BY score DESC, correct_answers DESC, p.joined_at, p.id`,
    [sessionId],
  );
  return result.rows.map((row, index) => ({
    rank: index + 1,
    playerId: row.id,
    nickname: row.nickname,
    score: row.score,
    correctAnswers: row.correct_answers,
  }));
}

type ResultAnswerRow = {
  id: string;
  is_correct: boolean;
  vote_count: number;
};

export type QuestionResults = {
  question: PublicQuestion;
  correctAnswerId: string;
  voteTotals: { answerId: string; count: number }[];
  answeredCount: number;
  totalPlayers: number;
  leaderboard: LeaderboardEntry[];
};

export async function questionResults(
  database: Database,
  sessionId: string,
): Promise<QuestionResults | undefined> {
  const question = await currentQuestion(database, sessionId);
  if (!question) return undefined;
  const answers = await database.query<ResultAnswerRow>(
    `SELECT option.id, option.is_correct,
            count(submission.id)::integer AS vote_count
       FROM answer_options option
       JOIN question_rounds round ON round.question_id = option.question_id
       LEFT JOIN answer_submissions submission
         ON submission.question_round_id = round.id
        AND submission.answer_option_id = option.id
      WHERE round.id = $1
      GROUP BY option.id, option.position, option.is_correct
      ORDER BY option.position`,
    [question.roundId],
  );
  const correct = answers.rows.find((answer) => answer.is_correct);
  if (!correct) throw new Error("Question has no correct answer");
  const totalResult = await database.query<{ total_players: number }>(
    `SELECT count(*)::integer AS total_players
       FROM players WHERE live_session_id = $1`,
    [sessionId],
  );
  const voteTotals = answers.rows.map((answer) => ({
    answerId: answer.id,
    count: answer.vote_count,
  }));
  return {
    question,
    correctAnswerId: correct.id,
    voteTotals,
    answeredCount: voteTotals.reduce(
      (total, answer) => total + answer.count,
      0,
    ),
    totalPlayers: totalResult.rows[0]!.total_players,
    leaderboard: (await leaderboard(database, sessionId)).slice(0, 5),
  };
}

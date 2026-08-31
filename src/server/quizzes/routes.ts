import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { findCurrentCreator } from "../auth/current-creator.js";
import { sessionCookieName } from "../auth/session.js";
import type { Database } from "../database/types.js";
import {
  legacyQuizInputSchema,
  quizInputSchema,
  type QuizInput,
} from "./schema.js";

type QuizRow = {
  quiz_id: string;
  title: string;
  theme: string;
  is_public: boolean;
  created_at: Date;
  updated_at: Date;
  pending_payload: unknown | null;
  question_id: string | null;
  question_position: number | null;
  prompt: string | null;
  points: number | null;
  time_limit_seconds: number | null;
  answer_id: string | null;
  answer_position: number | null;
  answer_text: string | null;
  is_correct: boolean | null;
};

async function authenticatedCreatorId(
  request: FastifyRequest,
  database: Database,
): Promise<string | undefined> {
  return (
    await findCurrentCreator(database, request.cookies[sessionCookieName])
  )?.id;
}

async function insertQuestions(
  client: PoolClient,
  quizId: string,
  input: QuizInput,
): Promise<void> {
  for (const [questionPosition, question] of input.questions.entries()) {
    const questionId = randomUUID();
    await client.query(
      `INSERT INTO questions (id, quiz_id, position, prompt, points, time_limit_seconds)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        questionId,
        quizId,
        questionPosition,
        question.prompt,
        question.points,
        question.timeLimitSeconds,
      ],
    );
    for (const [answerPosition, answer] of question.answers.entries()) {
      await client.query(
        `INSERT INTO answer_options (id, question_id, position, text, is_correct)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), questionId, answerPosition, answer.text, answer.correct],
      );
    }
  }
}

async function loadQuiz(database: Database, quizId: string, creatorId: string) {
  const result = await database.query<QuizRow>(
    `SELECT q.id AS quiz_id, q.title, q.theme, q.is_public, q.created_at, q.updated_at,
            q.pending_payload,
            qu.id AS question_id, qu.position AS question_position, qu.prompt, qu.points, qu.time_limit_seconds,
            a.id AS answer_id, a.position AS answer_position, a.text AS answer_text, a.is_correct
       FROM quizzes q
       LEFT JOIN questions qu ON qu.quiz_id = q.id
       LEFT JOIN answer_options a ON a.question_id = qu.id
      WHERE q.id = $1 AND q.creator_id = $2
      ORDER BY qu.position, a.position`,
    [quizId, creatorId],
  );
  const first = result.rows[0];
  if (!first) return undefined;
  const questions = new Map<
    string,
    {
      id: string;
      prompt: string;
      points: number;
      timeLimitSeconds: number;
      answers: { id: string; text: string; correct: boolean }[];
    }
  >();
  for (const row of result.rows) {
    if (
      !row.question_id ||
      row.prompt === null ||
      row.points === null ||
      row.time_limit_seconds === null
    )
      continue;
    let question = questions.get(row.question_id);
    if (!question) {
      question = {
        id: row.question_id,
        prompt: row.prompt,
        points: row.points,
        timeLimitSeconds: row.time_limit_seconds,
        answers: [],
      };
      questions.set(row.question_id, question);
    }
    if (row.answer_id && row.answer_text !== null && row.is_correct !== null)
      question.answers.push({
        id: row.answer_id,
        text: row.answer_text,
        correct: row.is_correct,
      });
  }
  const quiz = {
    id: first.quiz_id,
    title: first.title,
    theme: first.theme,
    isPublic: first.is_public,
    createdAt: first.created_at,
    updatedAt: first.updated_at,
    questions: [...questions.values()],
  };
  const pending = legacyQuizInputSchema.safeParse(first.pending_payload);
  if (!pending.success) return quiz;
  return {
    ...quiz,
    title: pending.data.title,
    theme: pending.data.theme,
    isPublic: pending.data.isPublic,
    questions: pending.data.questions,
  };
}

const idSchema = z.string().uuid();
const visibilityInputSchema = z.object({ isPublic: z.boolean() }).strict();

async function loadPublicQuiz(database: Database, quizId: string) {
  const result = await database.query<QuizRow & { creator_email: string }>(
    `SELECT q.id AS quiz_id, q.title, q.theme, q.is_public, q.created_at, q.updated_at,
            c.email AS creator_email,
            qu.id AS question_id, qu.position AS question_position, qu.prompt, qu.points, qu.time_limit_seconds,
            a.id AS answer_id, a.position AS answer_position, a.text AS answer_text, a.is_correct
       FROM quizzes q
       JOIN creators c ON c.id = q.creator_id
       LEFT JOIN questions qu ON qu.quiz_id = q.id
       LEFT JOIN answer_options a ON a.question_id = qu.id
      WHERE q.id = $1 AND q.is_public = true
      ORDER BY qu.position, a.position`,
    [quizId],
  );
  const first = result.rows[0];
  if (!first) return undefined;
  const questions = new Map<
    string,
    {
      id: string;
      prompt: string;
      points: number;
      timeLimitSeconds: number;
      answers: { id: string; text: string; correct: boolean }[];
    }
  >();
  for (const row of result.rows) {
    if (
      !row.question_id ||
      row.prompt === null ||
      row.points === null ||
      row.time_limit_seconds === null
    )
      continue;
    let question = questions.get(row.question_id);
    if (!question) {
      question = {
        id: row.question_id,
        prompt: row.prompt,
        points: row.points,
        timeLimitSeconds: row.time_limit_seconds,
        answers: [],
      };
      questions.set(row.question_id, question);
    }
    if (row.answer_id && row.answer_text !== null && row.is_correct !== null)
      question.answers.push({
        id: row.answer_id,
        text: row.answer_text,
        correct: row.is_correct,
      });
  }
  return {
    id: first.quiz_id,
    title: first.title,
    theme: first.theme,
    creator: first.creator_email,
    questions: [...questions.values()],
  };
}

export async function registerQuizRoutes(
  app: FastifyInstance,
  database: Database,
): Promise<void> {
  app.get("/api/public/quizzes", async () => {
    const mostPlayed = await database.query(
      `SELECT q.id, q.title, q.theme, q.play_count AS "playCount",
              c.email AS creator,
              count(qu.id)::integer AS "questionCount"
         FROM quizzes q
         JOIN creators c ON c.id = q.creator_id
         LEFT JOIN questions qu ON qu.quiz_id = q.id
        WHERE q.is_public = true
        GROUP BY q.id, c.email
        ORDER BY q.play_count DESC, q.updated_at DESC
        LIMIT 12`,
    );
    const latest = await database.query(
      `SELECT q.id, q.title, q.theme, q.play_count AS "playCount",
              c.email AS creator,
              count(qu.id)::integer AS "questionCount"
         FROM quizzes q
         JOIN creators c ON c.id = q.creator_id
         LEFT JOIN questions qu ON qu.quiz_id = q.id
        WHERE q.is_public = true
        GROUP BY q.id, c.email
        ORDER BY q.created_at DESC
        LIMIT 12`,
    );
    return { quizzes: mostPlayed.rows, latestQuizzes: latest.rows };
  });

  app.get("/api/public/quizzes/:id", async (request, reply) => {
    const parsedId = idSchema.safeParse((request.params as { id?: string }).id);
    if (!parsedId.success)
      return reply.code(404).send({ error: "Quiz not found." });
    const quiz = await loadPublicQuiz(database, parsedId.data);
    if (!quiz) return reply.code(404).send({ error: "Quiz not found." });
    return { quiz };
  });

  app.post("/api/public/quizzes/:id/play", async (request, reply) => {
    const parsedId = idSchema.safeParse((request.params as { id?: string }).id);
    if (!parsedId.success)
      return reply.code(404).send({ error: "Quiz not found." });
    const result = await database.query<{ play_count: number }>(
      `UPDATE quizzes
          SET play_count = play_count + 1
        WHERE id = $1 AND is_public = true
      RETURNING play_count`,
      [parsedId.data],
    );
    const row = result.rows[0];
    if (!row) return reply.code(404).send({ error: "Quiz not found." });
    return { playCount: row.play_count };
  });

  app.get("/api/quizzes", async (request, reply) => {
    const creatorId = await authenticatedCreatorId(request, database);
    if (!creatorId)
      return reply.code(401).send({ error: "Not authenticated." });
    const result = await database.query(
      `SELECT q.id, q.title, q.theme, q.is_public AS "isPublic", q.play_count AS "playCount", q.created_at AS "createdAt", q.updated_at AS "updatedAt",
              count(qu.id)::integer AS "questionCount",
              (SELECT s.id FROM live_sessions s WHERE s.quiz_id = q.id AND s.state <> 'FINISHED' ORDER BY s.created_at DESC LIMIT 1) AS "activeSessionId"
         FROM quizzes q LEFT JOIN questions qu ON qu.quiz_id = q.id
        WHERE q.creator_id = $1 GROUP BY q.id ORDER BY q.updated_at DESC`,
      [creatorId],
    );
    return { quizzes: result.rows };
  });

  app.get("/api/quizzes/:id", async (request, reply) => {
    const creatorId = await authenticatedCreatorId(request, database);
    if (!creatorId)
      return reply.code(401).send({ error: "Not authenticated." });
    const parsedId = idSchema.safeParse((request.params as { id?: string }).id);
    if (!parsedId.success)
      return reply.code(404).send({ error: "Quiz not found." });
    const quiz = await loadQuiz(database, parsedId.data, creatorId);
    return quiz ? { quiz } : reply.code(404).send({ error: "Quiz not found." });
  });

  app.patch("/api/quizzes/:id/visibility", async (request, reply) => {
    const creatorId = await authenticatedCreatorId(request, database);
    if (!creatorId)
      return reply.code(401).send({ error: "Not authenticated." });
    const parsedId = idSchema.safeParse((request.params as { id?: string }).id);
    const parsed = visibilityInputSchema.safeParse(request.body);
    if (!parsedId.success)
      return reply.code(404).send({ error: "Quiz not found." });
    if (!parsed.success)
      return reply.code(400).send({ error: "Visibility value is invalid." });
    const result = await database.query<{ isPublic: boolean }>(
      `UPDATE quizzes
          SET is_public = $1, updated_at = now()
        WHERE id = $2 AND creator_id = $3
        RETURNING is_public AS "isPublic"`,
      [parsed.data.isPublic, parsedId.data, creatorId],
    );
    if (!result.rowCount)
      return reply.code(404).send({ error: "Quiz not found." });
    return { isPublic: result.rows[0]!.isPublic };
  });

  app.post("/api/quizzes", async (request, reply) => {
    const creatorId = await authenticatedCreatorId(request, database);
    if (!creatorId)
      return reply.code(401).send({ error: "Not authenticated." });
    const parsed = quizInputSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Quiz data is invalid.",
        details: parsed.error.flatten(),
      });
    const quizId = randomUUID();
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO quizzes (id, creator_id, title, theme, is_public) VALUES ($1, $2, $3, $4, $5)",
        [
          quizId,
          creatorId,
          parsed.data.title,
          parsed.data.theme,
          parsed.data.isPublic,
        ],
      );
      await insertQuestions(client, quizId, parsed.data);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return reply
      .code(201)
      .send({ quiz: await loadQuiz(database, quizId, creatorId) });
  });

  app.put("/api/quizzes/:id", async (request, reply) => {
    const creatorId = await authenticatedCreatorId(request, database);
    if (!creatorId)
      return reply.code(401).send({ error: "Not authenticated." });
    const parsedId = idSchema.safeParse((request.params as { id?: string }).id);
    const parsed = legacyQuizInputSchema.safeParse(request.body);
    if (!parsedId.success)
      return reply.code(404).send({ error: "Quiz not found." });
    if (!parsed.success)
      return reply.code(400).send({
        error: "Quiz data is invalid.",
        details: parsed.error.flatten(),
      });
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const owned = await client.query(
        "SELECT id FROM quizzes WHERE id = $1 AND creator_id = $2 FOR UPDATE",
        [parsedId.data, creatorId],
      );
      if (!owned.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ error: "Quiz not found." });
      }
      const active = await client.query(
        "SELECT 1 FROM live_sessions WHERE quiz_id = $1 AND state <> 'FINISHED' LIMIT 1",
        [parsedId.data],
      );
      if (active.rowCount) {
        await client.query(
          `UPDATE quizzes
              SET pending_payload = $1, updated_at = now()
            WHERE id = $2 AND creator_id = $3`,
          [parsed.data, parsedId.data, creatorId],
        );
        await client.query("COMMIT");
        return {
          quiz: await loadQuiz(database, parsedId.data, creatorId),
          pending: true,
        };
      }
      await client.query(
        `UPDATE quizzes SET title = $1, theme = $2, is_public = $3,
            pending_payload = NULL, updated_at = now()
          WHERE id = $4 AND creator_id = $5`,
        [
          parsed.data.title,
          parsed.data.theme,
          parsed.data.isPublic,
          parsedId.data,
          creatorId,
        ],
      );
      // Finished sessions are disposable history. Remove them before replacing
      // question rows so their question_rounds cannot hold foreign-key locks.
      await client.query(
        "DELETE FROM live_sessions WHERE quiz_id = $1 AND state = 'FINISHED'",
        [parsedId.data],
      );
      await client.query("DELETE FROM questions WHERE quiz_id = $1", [
        parsedId.data,
      ]);
      await insertQuestions(client, parsedId.data, parsed.data);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return { quiz: await loadQuiz(database, parsedId.data, creatorId) };
  });

  app.delete("/api/quizzes/:id", async (request, reply) => {
    const creatorId = await authenticatedCreatorId(request, database);
    if (!creatorId)
      return reply.code(401).send({ error: "Not authenticated." });
    const parsedId = idSchema.safeParse((request.params as { id?: string }).id);
    if (!parsedId.success)
      return reply.code(404).send({ error: "Quiz not found." });
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const owned = await client.query(
        "SELECT id FROM quizzes WHERE id = $1 AND creator_id = $2 FOR UPDATE",
        [parsedId.data, creatorId],
      );
      if (!owned.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ error: "Quiz not found." });
      }
      const active = await client.query(
        "SELECT 1 FROM live_sessions WHERE quiz_id = $1 AND state <> 'FINISHED' LIMIT 1",
        [parsedId.data],
      );
      if (active.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          error: "Cancel or finish the active lobby before deleting this quiz.",
        });
      }
      await client.query(
        "DELETE FROM live_sessions WHERE quiz_id = $1 AND state = 'FINISHED'",
        [parsedId.data],
      );
      await client.query("DELETE FROM quizzes WHERE id = $1", [parsedId.data]);
      await client.query("COMMIT");
      return reply.code(204).send();
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { findCurrentCreator } from "../auth/current-creator.js";
import { sessionCookieName } from "../auth/session.js";
import { quizInputSchema } from "./schema.js";
async function authenticatedCreatorId(request, database) {
    return (await findCurrentCreator(database, request.cookies[sessionCookieName]))?.id;
}
async function insertQuestions(client, quizId, input) {
    for (const [questionPosition, question] of input.questions.entries()) {
        const questionId = randomUUID();
        await client.query(`INSERT INTO questions (id, quiz_id, position, prompt, points, time_limit_seconds)
       VALUES ($1, $2, $3, $4, $5, $6)`, [
            questionId,
            quizId,
            questionPosition,
            question.prompt,
            question.points,
            question.timeLimitSeconds,
        ]);
        for (const [answerPosition, answer] of question.answers.entries()) {
            await client.query(`INSERT INTO answer_options (id, question_id, position, text, is_correct)
         VALUES ($1, $2, $3, $4, $5)`, [randomUUID(), questionId, answerPosition, answer.text, answer.correct]);
        }
    }
}
async function loadQuiz(database, quizId, creatorId) {
    const result = await database.query(`SELECT q.id AS quiz_id, q.title, q.theme, q.created_at, q.updated_at,
            qu.id AS question_id, qu.position AS question_position, qu.prompt, qu.points, qu.time_limit_seconds,
            a.id AS answer_id, a.position AS answer_position, a.text AS answer_text, a.is_correct
       FROM quizzes q
       LEFT JOIN questions qu ON qu.quiz_id = q.id
       LEFT JOIN answer_options a ON a.question_id = qu.id
      WHERE q.id = $1 AND q.creator_id = $2
      ORDER BY qu.position, a.position`, [quizId, creatorId]);
    const first = result.rows[0];
    if (!first)
        return undefined;
    const questions = new Map();
    for (const row of result.rows) {
        if (!row.question_id ||
            row.prompt === null ||
            row.points === null ||
            row.time_limit_seconds === null)
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
        createdAt: first.created_at,
        updatedAt: first.updated_at,
        questions: [...questions.values()],
    };
}
const idSchema = z.string().uuid();
export async function registerQuizRoutes(app, database) {
    app.get("/api/quizzes", async (request, reply) => {
        const creatorId = await authenticatedCreatorId(request, database);
        if (!creatorId)
            return reply.code(401).send({ error: "Not authenticated." });
        const result = await database.query(`SELECT q.id, q.title, q.theme, q.created_at AS "createdAt", q.updated_at AS "updatedAt",
              count(qu.id)::integer AS "questionCount",
              (SELECT s.id FROM live_sessions s WHERE s.quiz_id = q.id AND s.state <> 'FINISHED' ORDER BY s.created_at DESC LIMIT 1) AS "activeSessionId"
         FROM quizzes q LEFT JOIN questions qu ON qu.quiz_id = q.id
        WHERE q.creator_id = $1 GROUP BY q.id ORDER BY q.updated_at DESC`, [creatorId]);
        return { quizzes: result.rows };
    });
    app.get("/api/quizzes/:id", async (request, reply) => {
        const creatorId = await authenticatedCreatorId(request, database);
        if (!creatorId)
            return reply.code(401).send({ error: "Not authenticated." });
        const parsedId = idSchema.safeParse(request.params.id);
        if (!parsedId.success)
            return reply.code(404).send({ error: "Quiz not found." });
        const quiz = await loadQuiz(database, parsedId.data, creatorId);
        return quiz ? { quiz } : reply.code(404).send({ error: "Quiz not found." });
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
            await client.query("INSERT INTO quizzes (id, creator_id, title, theme) VALUES ($1, $2, $3, $4)", [quizId, creatorId, parsed.data.title, parsed.data.theme]);
            await insertQuestions(client, quizId, parsed.data);
            await client.query("COMMIT");
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
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
        const parsedId = idSchema.safeParse(request.params.id);
        const parsed = quizInputSchema.safeParse(request.body);
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
            const owned = await client.query("SELECT id FROM quizzes WHERE id = $1 AND creator_id = $2 FOR UPDATE", [parsedId.data, creatorId]);
            if (!owned.rowCount) {
                await client.query("ROLLBACK");
                return reply.code(404).send({ error: "Quiz not found." });
            }
            const active = await client.query("SELECT 1 FROM live_sessions WHERE quiz_id = $1 AND state <> 'FINISHED' LIMIT 1", [parsedId.data]);
            if (active.rowCount) {
                await client.query("ROLLBACK");
                return reply.code(409).send({
                    error: "Cancel or finish the active lobby before editing this quiz.",
                });
            }
            await client.query(`UPDATE quizzes SET title = $1, theme = $2, updated_at = now()
          WHERE id = $3 AND creator_id = $4`, [parsed.data.title, parsed.data.theme, parsedId.data, creatorId]);
            await client.query("DELETE FROM questions WHERE quiz_id = $1", [
                parsedId.data,
            ]);
            await insertQuestions(client, parsedId.data, parsed.data);
            await client.query("COMMIT");
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
        return { quiz: await loadQuiz(database, parsedId.data, creatorId) };
    });
    app.delete("/api/quizzes/:id", async (request, reply) => {
        const creatorId = await authenticatedCreatorId(request, database);
        if (!creatorId)
            return reply.code(401).send({ error: "Not authenticated." });
        const parsedId = idSchema.safeParse(request.params.id);
        if (!parsedId.success)
            return reply.code(404).send({ error: "Quiz not found." });
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const owned = await client.query("SELECT id FROM quizzes WHERE id = $1 AND creator_id = $2 FOR UPDATE", [parsedId.data, creatorId]);
            if (!owned.rowCount) {
                await client.query("ROLLBACK");
                return reply.code(404).send({ error: "Quiz not found." });
            }
            const active = await client.query("SELECT 1 FROM live_sessions WHERE quiz_id = $1 AND state <> 'FINISHED' LIMIT 1", [parsedId.data]);
            if (active.rowCount) {
                await client.query("ROLLBACK");
                return reply.code(409).send({
                    error: "Cancel or finish the active lobby before deleting this quiz.",
                });
            }
            await client.query("DELETE FROM quizzes WHERE id = $1", [parsedId.data]);
            await client.query("COMMIT");
            return reply.code(204).send();
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    });
}
//# sourceMappingURL=routes.js.map
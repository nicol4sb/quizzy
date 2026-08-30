import { randomUUID } from "node:crypto";
import { z } from "zod";
import { findCurrentCreator } from "../auth/current-creator.js";
import { sessionCookieName } from "../auth/session.js";
import { bearerToken, findCurrentPlayer } from "../players/current-player.js";
import { createPlayerToken, hashPlayerToken } from "../players/token.js";
import { currentQuestion } from "./current-question.js";
import { answerProgress } from "./answer-progress.js";
import { createJoinCode } from "./join-code.js";
import { leaderboard, questionResults } from "./results.js";
import { speedScore } from "./scoring.js";
const idSchema = z.string().uuid();
const joinCodeSchema = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
const joinSchema = z
    .object({ nickname: z.string().trim().min(1).max(24) })
    .strict();
const startSchema = z
    .object({ expectedRevision: z.number().int().positive() })
    .strict();
const transitionSchema = startSchema;
const answerSchema = z
    .object({
    submissionId: z.string().uuid(),
    roundId: z.string().uuid(),
    answerId: z.string().uuid(),
})
    .strict();
function publicPlayer(row) {
    return { id: row.id, nickname: row.nickname, joinedAt: row.joined_at };
}
async function playersFor(database, sessionId) {
    const result = await database.query(`SELECT id, nickname, joined_at
       FROM players
      WHERE live_session_id = $1
      ORDER BY joined_at, id`, [sessionId]);
    return result.rows.map(publicPlayer);
}
async function creatorId(request, database) {
    return (await findCurrentCreator(database, request.cookies[sessionCookieName]))?.id;
}
function publicSession(row) {
    return {
        id: row.id,
        quizId: row.quiz_id,
        quizTitle: row.quiz_title,
        quizTheme: row.quiz_theme,
        joinCode: row.join_code.trim(),
        joinPath: `/join/${row.join_code.trim()}`,
        state: row.state,
        revision: row.revision,
        createdAt: row.created_at,
    };
}
const sessionSelect = `SELECT s.id, s.quiz_id, q.title AS quiz_title, q.theme AS quiz_theme, s.join_code, s.state, s.revision, s.created_at
  FROM live_sessions s JOIN quizzes q ON q.id = s.quiz_id`;
export async function registerSessionRoutes(app, database) {
    app.post("/api/quizzes/:id/sessions", async (request, reply) => {
        const hostCreatorId = await creatorId(request, database);
        if (!hostCreatorId)
            return reply.code(401).send({ error: "Not authenticated." });
        const parsedId = idSchema.safeParse(request.params.id);
        if (!parsedId.success)
            return reply.code(404).send({ error: "Quiz not found." });
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const quiz = await client.query(`SELECT q.id FROM quizzes q
          WHERE q.id = $1 AND q.creator_id = $2
            AND EXISTS (SELECT 1 FROM questions qu WHERE qu.quiz_id = q.id)
          FOR UPDATE`, [parsedId.data, hostCreatorId]);
            if (!quiz.rowCount) {
                await client.query("ROLLBACK");
                return reply
                    .code(404)
                    .send({ error: "Quiz not found or not playable." });
            }
            const existing = await client.query("SELECT 1 FROM live_sessions WHERE quiz_id = $1 AND state <> 'FINISHED' LIMIT 1", [parsedId.data]);
            if (existing.rowCount) {
                await client.query("ROLLBACK");
                return reply
                    .code(409)
                    .send({ error: "This quiz already has an active lobby." });
            }
            const sessionId = randomUUID();
            let created;
            for (let attempt = 0; attempt < 10 && !created; attempt += 1) {
                const code = createJoinCode();
                const result = await client.query(`INSERT INTO live_sessions (id, quiz_id, host_creator_id, join_code)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (join_code) DO NOTHING
           RETURNING id, quiz_id, (SELECT title FROM quizzes WHERE id = $2) AS quiz_title,
                     (SELECT theme FROM quizzes WHERE id = $2) AS quiz_theme,
                     join_code, state, revision, created_at`, [sessionId, parsedId.data, hostCreatorId, code]);
                created = result.rows[0];
            }
            if (!created)
                throw new Error("Could not allocate a unique join code");
            await client.query("COMMIT");
            return reply.code(201).send({ session: publicSession(created) });
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    });
    app.get("/api/sessions/:id/host", async (request, reply) => {
        const hostCreatorId = await creatorId(request, database);
        if (!hostCreatorId)
            return reply.code(401).send({ error: "Not authenticated." });
        const parsedId = idSchema.safeParse(request.params.id);
        if (!parsedId.success)
            return reply.code(404).send({ error: "Session not found." });
        const result = await database.query(`${sessionSelect} WHERE s.id = $1 AND s.host_creator_id = $2`, [parsedId.data, hostCreatorId]);
        const session = result.rows[0];
        if (!session)
            return reply.code(404).send({ error: "Session not found." });
        const question = ["QUESTION_OPEN", "RESULTS", "FINISHED"].includes(session.state)
            ? await currentQuestion(database, session.id)
            : undefined;
        return {
            session: publicSession(session),
            players: await playersFor(database, session.id),
            currentQuestion: question,
            answerProgress: question
                ? await answerProgress(database, session.id, question.roundId)
                : undefined,
            results: session.state === "RESULTS"
                ? await questionResults(database, session.id)
                : undefined,
            leaderboard: session.state === "FINISHED"
                ? await leaderboard(database, session.id)
                : undefined,
        };
    });
    app.get("/api/sessions/:id/player", async (request, reply) => {
        const parsedId = idSchema.safeParse(request.params.id);
        if (!parsedId.success)
            return reply.code(404).send({ error: "Session not found." });
        const player = await findCurrentPlayer(database, parsedId.data, bearerToken(request.headers.authorization));
        if (!player)
            return reply.code(401).send({ error: "Not authorized." });
        const result = await database.query(`${sessionSelect} WHERE s.id = $1`, [parsedId.data]);
        const session = result.rows[0];
        if (!session)
            return reply.code(404).send({ error: "Session not found." });
        const question = ["QUESTION_OPEN", "RESULTS", "FINISHED"].includes(session.state)
            ? await currentQuestion(database, session.id)
            : undefined;
        const submittedAnswer = question
            ? await database.query(`SELECT answer_option_id
             FROM answer_submissions
            WHERE question_round_id = $1 AND player_id = $2`, [question.roundId, player.id])
            : undefined;
        return {
            session: publicSession(session),
            player: { id: player.id, nickname: player.nickname },
            currentQuestion: question,
            submittedAnswerId: submittedAnswer?.rows[0]?.answer_option_id,
            results: session.state === "RESULTS"
                ? await questionResults(database, session.id)
                : undefined,
            leaderboard: session.state === "FINISHED"
                ? await leaderboard(database, session.id)
                : undefined,
        };
    });
    app.get("/api/lobbies/:code", async (request, reply) => {
        const parsedCode = joinCodeSchema.safeParse(request.params.code);
        if (!parsedCode.success)
            return reply.code(404).send({ error: "Lobby not found." });
        const result = await database.query(`${sessionSelect} WHERE s.join_code = $1 AND s.state = 'LOBBY'`, [parsedCode.data]);
        const session = result.rows[0];
        return session
            ? {
                lobby: {
                    joinCode: session.join_code.trim(),
                    quizTitle: session.quiz_title,
                },
            }
            : reply.code(404).send({ error: "Lobby not found or already started." });
    });
    app.post("/api/lobbies/:code/players", async (request, reply) => {
        const parsedCode = joinCodeSchema.safeParse(request.params.code);
        const parsedBody = joinSchema.safeParse(request.body);
        if (!parsedCode.success)
            return reply.code(404).send({ error: "Lobby not found." });
        if (!parsedBody.success)
            return reply
                .code(400)
                .send({ error: "Nickname must be between 1 and 24 characters." });
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const found = await client.query(`${sessionSelect} WHERE s.join_code = $1 FOR UPDATE OF s`, [parsedCode.data]);
            const session = found.rows[0];
            if (!session || session.state !== "LOBBY") {
                await client.query("ROLLBACK");
                return reply
                    .code(404)
                    .send({ error: "Lobby not found or already started." });
            }
            const token = createPlayerToken();
            const inserted = await client.query(`INSERT INTO players (id, live_session_id, nickname, token_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, nickname, joined_at`, [
                randomUUID(),
                session.id,
                parsedBody.data.nickname,
                hashPlayerToken(token),
            ]);
            const revision = await client.query(`UPDATE live_sessions
            SET revision = revision + 1
          WHERE id = $1
          RETURNING revision`, [session.id]);
            await client.query("COMMIT");
            const players = await playersFor(database, session.id);
            await app.roomEventBus.publish(session.id, {
                type: "lobby_updated",
                revision: revision.rows[0].revision,
                payload: { players },
            });
            return reply.code(201).send({
                sessionId: session.id,
                quizTitle: session.quiz_title,
                player: publicPlayer(inserted.rows[0]),
                token,
            });
        }
        catch (error) {
            await client.query("ROLLBACK");
            if (error.code === "23505")
                return reply
                    .code(409)
                    .send({ error: "That nickname is already taken." });
            throw error;
        }
        finally {
            client.release();
        }
    });
    app.post("/api/sessions/:id/start", async (request, reply) => {
        const hostCreatorId = await creatorId(request, database);
        if (!hostCreatorId)
            return reply.code(401).send({ error: "Not authenticated." });
        const parsedId = idSchema.safeParse(request.params.id);
        const parsedBody = startSchema.safeParse(request.body);
        if (!parsedId.success)
            return reply.code(404).send({ error: "Session not found." });
        if (!parsedBody.success)
            return reply.code(400).send({ error: "Invalid session revision." });
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const locked = await client.query(`${sessionSelect}
          WHERE s.id = $1 AND s.host_creator_id = $2
          FOR UPDATE OF s`, [parsedId.data, hostCreatorId]);
            const session = locked.rows[0];
            if (!session) {
                await client.query("ROLLBACK");
                return reply.code(404).send({ error: "Session not found." });
            }
            if (session.state !== "LOBBY" ||
                session.revision !== parsedBody.data.expectedRevision) {
                await client.query("ROLLBACK");
                return reply.code(409).send({
                    error: "The lobby has already changed. Refresh and try again.",
                });
            }
            const playerCount = await client.query("SELECT 1 FROM players WHERE live_session_id = $1 LIMIT 1", [session.id]);
            if (!playerCount.rowCount) {
                await client.query("ROLLBACK");
                return reply
                    .code(409)
                    .send({ error: "At least one player must join before starting." });
            }
            const firstQuestion = await client.query(`SELECT id, position, time_limit_seconds
           FROM questions
          WHERE quiz_id = $1
          ORDER BY position
          LIMIT 1`, [session.quiz_id]);
            const question = firstQuestion.rows[0];
            if (!question)
                throw new Error("Playable quiz has no first question");
            await client.query(`INSERT INTO question_rounds
           (id, live_session_id, question_id, position, opened_at, closes_at)
         VALUES ($1, $2, $3, $4, now(), now() + make_interval(secs => $5))`, [
                randomUUID(),
                session.id,
                question.id,
                question.position,
                question.time_limit_seconds,
            ]);
            const updated = await client.query(`UPDATE live_sessions
            SET state = 'QUESTION_OPEN', revision = revision + 1,
                started_at = now()
          WHERE id = $1
          RETURNING revision`, [session.id]);
            await client.query("COMMIT");
            const publicQuestion = await currentQuestion(database, session.id);
            if (!publicQuestion)
                throw new Error("Started question could not be read");
            await app.roomEventBus.publish(session.id, {
                type: "question_opened",
                revision: updated.rows[0].revision,
                payload: { question: publicQuestion },
            });
            return {
                state: "QUESTION_OPEN",
                revision: updated.rows[0].revision,
                question: publicQuestion,
            };
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    });
    app.post("/api/sessions/:id/answers", async (request, reply) => {
        const parsedId = idSchema.safeParse(request.params.id);
        const parsedBody = answerSchema.safeParse(request.body);
        if (!parsedId.success)
            return reply.code(404).send({ error: "Session not found." });
        if (!parsedBody.success)
            return reply.code(400).send({ error: "Invalid answer submission." });
        const player = await findCurrentPlayer(database, parsedId.data, bearerToken(request.headers.authorization));
        if (!player)
            return reply.code(401).send({ error: "Not authorized." });
        const client = await database.connect();
        let transactionOpen = true;
        try {
            await client.query("BEGIN");
            const roundResult = await client.query(`SELECT s.revision, s.state, r.opened_at, r.closes_at, now() AS server_now,
                a.is_correct AS answer_is_correct, q.points
           FROM live_sessions s
           JOIN question_rounds r ON r.live_session_id = s.id
           JOIN questions q ON q.id = r.question_id
           JOIN answer_options a ON a.question_id = q.id
          WHERE s.id = $1 AND r.id = $2 AND a.id = $3
          FOR UPDATE OF s`, [parsedId.data, parsedBody.data.roundId, parsedBody.data.answerId]);
            const round = roundResult.rows[0];
            if (!round) {
                await client.query("ROLLBACK");
                transactionOpen = false;
                return reply.code(400).send({ error: "That answer is not valid." });
            }
            const existing = await client.query(`SELECT id, answer_option_id
           FROM answer_submissions
          WHERE question_round_id = $1 AND player_id = $2`, [parsedBody.data.roundId, player.id]);
            if (existing.rows[0]) {
                await client.query("ROLLBACK");
                transactionOpen = false;
                return existing.rows[0].id === parsedBody.data.submissionId &&
                    existing.rows[0].answer_option_id === parsedBody.data.answerId
                    ? { accepted: true }
                    : reply.code(409).send({ error: "You already answered." });
            }
            if (round.state !== "QUESTION_OPEN" ||
                round.server_now > round.closes_at) {
                await client.query("ROLLBACK");
                transactionOpen = false;
                return reply.code(409).send({ error: "Answering is closed." });
            }
            await client.query(`INSERT INTO answer_submissions
           (id, question_round_id, player_id, answer_option_id, is_correct, points_awarded)
         VALUES ($1, $2, $3, $4, $5, $6)`, [
                parsedBody.data.submissionId,
                parsedBody.data.roundId,
                player.id,
                parsedBody.data.answerId,
                round.answer_is_correct,
                round.answer_is_correct
                    ? speedScore(round.points, round.opened_at, round.closes_at, round.server_now)
                    : 0,
            ]);
            const progressResult = await client.query(`SELECT
           (SELECT count(*)::integer FROM answer_submissions WHERE question_round_id = $2) AS answered_count,
           (SELECT count(*)::integer FROM players WHERE live_session_id = $1) AS total_players`, [parsedId.data, parsedBody.data.roundId]);
            const counts = progressResult.rows[0];
            let resultsRevision;
            if (counts.total_players > 0 &&
                counts.answered_count === counts.total_players) {
                await client.query("UPDATE question_rounds SET closed_at = now() WHERE id = $1", [parsedBody.data.roundId]);
                const updated = await client.query(`UPDATE live_sessions
              SET state = 'RESULTS', revision = revision + 1
            WHERE id = $1 AND state = 'QUESTION_OPEN'
            RETURNING revision`, [parsedId.data]);
                resultsRevision = updated.rows[0]?.revision;
            }
            await client.query("COMMIT");
            transactionOpen = false;
            const progress = {
                answeredCount: counts.answered_count,
                totalPlayers: counts.total_players,
            };
            await app.roomEventBus.publish(parsedId.data, {
                type: "answer_count_updated",
                revision: round.revision,
                payload: { roundId: parsedBody.data.roundId, ...progress },
            });
            if (resultsRevision !== undefined) {
                const results = await questionResults(database, parsedId.data);
                if (!results)
                    throw new Error("Automatic results could not be read");
                await app.roomEventBus.publish(parsedId.data, {
                    type: "results_revealed",
                    revision: resultsRevision,
                    payload: { results },
                });
            }
            return { accepted: true };
        }
        catch (error) {
            if (transactionOpen)
                await client.query("ROLLBACK");
            if (error.code === "23505")
                return reply.code(409).send({ error: "You already answered." });
            throw error;
        }
        finally {
            client.release();
        }
    });
    app.post("/api/sessions/:id/reveal", async (request, reply) => {
        const hostCreatorId = await creatorId(request, database);
        if (!hostCreatorId)
            return reply.code(401).send({ error: "Not authenticated." });
        const parsedId = idSchema.safeParse(request.params.id);
        const parsedBody = transitionSchema.safeParse(request.body);
        if (!parsedId.success)
            return reply.code(404).send({ error: "Session not found." });
        if (!parsedBody.success)
            return reply.code(400).send({ error: "Invalid session revision." });
        const client = await database.connect();
        let transactionOpen = true;
        try {
            await client.query("BEGIN");
            const locked = await client.query(`${sessionSelect}
          WHERE s.id = $1 AND s.host_creator_id = $2
          FOR UPDATE OF s`, [parsedId.data, hostCreatorId]);
            const session = locked.rows[0];
            if (!session) {
                await client.query("ROLLBACK");
                transactionOpen = false;
                return reply.code(404).send({ error: "Session not found." });
            }
            if (session.state !== "QUESTION_OPEN" ||
                session.revision !== parsedBody.data.expectedRevision) {
                await client.query("ROLLBACK");
                transactionOpen = false;
                return reply
                    .code(409)
                    .send({ error: "The session has already changed." });
            }
            const closed = await client.query(`UPDATE question_rounds
            SET closed_at = now()
          WHERE id = (
            SELECT id FROM question_rounds
             WHERE live_session_id = $1
             ORDER BY position DESC LIMIT 1
          )`, [session.id]);
            if (!closed.rowCount)
                throw new Error("Open session has no question round");
            const updated = await client.query(`UPDATE live_sessions
            SET state = 'RESULTS', revision = revision + 1
          WHERE id = $1 RETURNING revision`, [session.id]);
            await client.query("COMMIT");
            transactionOpen = false;
            const results = await questionResults(database, session.id);
            if (!results)
                throw new Error("Revealed results could not be read");
            await app.roomEventBus.publish(session.id, {
                type: "results_revealed",
                revision: updated.rows[0].revision,
                payload: { results },
            });
            return {
                state: "RESULTS",
                revision: updated.rows[0].revision,
                results,
            };
        }
        catch (error) {
            if (transactionOpen)
                await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    });
    app.post("/api/sessions/:id/next", async (request, reply) => {
        const hostCreatorId = await creatorId(request, database);
        if (!hostCreatorId)
            return reply.code(401).send({ error: "Not authenticated." });
        const parsedId = idSchema.safeParse(request.params.id);
        const parsedBody = transitionSchema.safeParse(request.body);
        if (!parsedId.success)
            return reply.code(404).send({ error: "Session not found." });
        if (!parsedBody.success)
            return reply.code(400).send({ error: "Invalid session revision." });
        const client = await database.connect();
        let transactionOpen = true;
        try {
            await client.query("BEGIN");
            const locked = await client.query(`${sessionSelect}
          WHERE s.id = $1 AND s.host_creator_id = $2
          FOR UPDATE OF s`, [parsedId.data, hostCreatorId]);
            const session = locked.rows[0];
            if (!session) {
                await client.query("ROLLBACK");
                transactionOpen = false;
                return reply.code(404).send({ error: "Session not found." });
            }
            if (session.state !== "RESULTS" ||
                session.revision !== parsedBody.data.expectedRevision) {
                await client.query("ROLLBACK");
                transactionOpen = false;
                return reply
                    .code(409)
                    .send({ error: "The session has already changed." });
            }
            const next = await client.query(`SELECT q.id, q.position, q.time_limit_seconds
           FROM questions q
          WHERE q.quiz_id = $1
            AND q.position > COALESCE((
              SELECT max(position) FROM question_rounds WHERE live_session_id = $2
            ), -1)
          ORDER BY q.position LIMIT 1`, [session.quiz_id, session.id]);
            const question = next.rows[0];
            if (!question) {
                await client.query("ROLLBACK");
                transactionOpen = false;
                return reply.code(409).send({ error: "There are no more questions." });
            }
            await client.query(`INSERT INTO question_rounds
           (id, live_session_id, question_id, position, opened_at, closes_at)
         VALUES ($1, $2, $3, $4, now(), now() + make_interval(secs => $5))`, [
                randomUUID(),
                session.id,
                question.id,
                question.position,
                question.time_limit_seconds,
            ]);
            const updated = await client.query(`UPDATE live_sessions
            SET state = 'QUESTION_OPEN', revision = revision + 1
          WHERE id = $1 RETURNING revision`, [session.id]);
            await client.query("COMMIT");
            transactionOpen = false;
            const publicQuestion = await currentQuestion(database, session.id);
            if (!publicQuestion)
                throw new Error("Next question could not be read");
            await app.roomEventBus.publish(session.id, {
                type: "question_opened",
                revision: updated.rows[0].revision,
                payload: { question: publicQuestion },
            });
            return {
                state: "QUESTION_OPEN",
                revision: updated.rows[0].revision,
                question: publicQuestion,
            };
        }
        catch (error) {
            if (transactionOpen)
                await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    });
    app.post("/api/sessions/:id/finish", async (request, reply) => {
        const hostCreatorId = await creatorId(request, database);
        if (!hostCreatorId)
            return reply.code(401).send({ error: "Not authenticated." });
        const parsedId = idSchema.safeParse(request.params.id);
        const parsedBody = transitionSchema.safeParse(request.body);
        if (!parsedId.success)
            return reply.code(404).send({ error: "Session not found." });
        if (!parsedBody.success)
            return reply.code(400).send({ error: "Invalid session revision." });
        const client = await database.connect();
        let transactionOpen = true;
        try {
            await client.query("BEGIN");
            const locked = await client.query(`${sessionSelect}
          WHERE s.id = $1 AND s.host_creator_id = $2
          FOR UPDATE OF s`, [parsedId.data, hostCreatorId]);
            const session = locked.rows[0];
            if (!session) {
                await client.query("ROLLBACK");
                transactionOpen = false;
                return reply.code(404).send({ error: "Session not found." });
            }
            if (session.state !== "RESULTS" ||
                session.revision !== parsedBody.data.expectedRevision) {
                await client.query("ROLLBACK");
                transactionOpen = false;
                return reply
                    .code(409)
                    .send({ error: "The session has already changed." });
            }
            const remaining = await client.query(`SELECT 1 FROM questions q
          WHERE q.quiz_id = $1
            AND q.position > COALESCE((
              SELECT max(position) FROM question_rounds WHERE live_session_id = $2
            ), -1)
          LIMIT 1`, [session.quiz_id, session.id]);
            if (remaining.rowCount) {
                await client.query("ROLLBACK");
                transactionOpen = false;
                return reply
                    .code(409)
                    .send({ error: "There are questions remaining." });
            }
            const updated = await client.query(`UPDATE live_sessions
            SET state = 'FINISHED', revision = revision + 1,
                finished_at = now()
          WHERE id = $1 RETURNING revision`, [session.id]);
            await client.query("COMMIT");
            transactionOpen = false;
            const finalLeaderboard = await leaderboard(database, session.id);
            await app.roomEventBus.publish(session.id, {
                type: "quiz_finished",
                revision: updated.rows[0].revision,
                payload: {
                    leaderboard: finalLeaderboard,
                    podium: finalLeaderboard.slice(0, 3),
                },
            });
            return {
                state: "FINISHED",
                revision: updated.rows[0].revision,
                leaderboard: finalLeaderboard,
                podium: finalLeaderboard.slice(0, 3),
            };
        }
        catch (error) {
            if (transactionOpen)
                await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    });
    app.delete("/api/sessions/:id", async (request, reply) => {
        const hostCreatorId = await creatorId(request, database);
        if (!hostCreatorId)
            return reply.code(401).send({ error: "Not authenticated." });
        const parsedId = idSchema.safeParse(request.params.id);
        if (!parsedId.success)
            return reply.code(404).send({ error: "Session not found." });
        const client = await database.connect();
        let transactionOpen = true;
        try {
            await client.query("BEGIN");
            const session = await client.query(`SELECT id FROM live_sessions
          WHERE id = $1 AND host_creator_id = $2 AND state <> 'FINISHED'
          FOR UPDATE`, [parsedId.data, hostCreatorId]);
            if (!session.rowCount) {
                await client.query("ROLLBACK");
                transactionOpen = false;
                return reply.code(404).send({ error: "Active session not found." });
            }
            await client.query("DELETE FROM live_sessions WHERE id = $1", [
                parsedId.data,
            ]);
            await client.query("COMMIT");
            transactionOpen = false;
            await app.roomEventBus.publish(parsedId.data, {
                type: "session_ended",
                payload: { reason: "cancelled_by_host" },
            });
            return reply.code(204).send();
        }
        catch (error) {
            if (transactionOpen)
                await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    });
}
//# sourceMappingURL=routes.js.map
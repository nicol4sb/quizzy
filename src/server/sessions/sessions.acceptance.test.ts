import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { InMemoryRoomEventBus } from "../realtime/in-memory-room-event-bus.js";

config({ path: ".env.test", quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error("TEST_DATABASE_URL is required for session acceptance tests");
const pool = new Pool({ connectionString: databaseUrl, max: 3 });
const eventBus = new InMemoryRoomEventBus();
const app = await buildApp({ pool, eventBus });

beforeAll(async () => {
  await pool.query(await readFile("database/schema.sql", "utf8"));
});
beforeEach(async () => {
  await pool.query("TRUNCATE creator_sessions, creators CASCADE");
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

async function register(email: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password: "correct horse battery staple" },
  });
  const setCookie = response.headers["set-cookie"];
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!value) throw new Error("Registration returned no cookie");
  return value.split(";", 1)[0]!;
}

const quizInput = {
  title: "Launchable quiz",
  theme: "minimal",
  questions: [
    {
      prompt: "A valid question?",
      points: 1000,
      timeLimitSeconds: 20,
      answers: [
        { text: "Yes", correct: true },
        { text: "No", correct: false },
      ],
    },
  ],
};

async function createQuiz(
  cookie: string,
  input: typeof quizInput = quizInput,
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/quizzes",
    headers: { cookie },
    payload: input,
  });
  return response.json().quiz.id as string;
}

async function openAnswers(roundId: string): Promise<void> {
  await pool.query(
    `UPDATE question_rounds r
        SET answers_available_at = now() - interval '1 millisecond',
            closes_at = now() + make_interval(secs => q.time_limit_seconds)
       FROM questions q
      WHERE r.id = $1 AND q.id = r.question_id`,
    [roundId],
  );
}

describe("live session launch", () => {
  it("launches an owned playable quiz with a unique public join code", async () => {
    const cookie = await register("host@example.com");
    const quizId = await createQuiz(cookie);
    const launched = await app.inject({
      method: "POST",
      url: `/api/quizzes/${quizId}/sessions`,
      headers: { cookie },
    });
    expect(launched.statusCode).toBe(201);
    expect(launched.json().session).toEqual(
      expect.objectContaining({
        quizId,
        quizTitle: quizInput.title,
        quizTheme: quizInput.theme,
        state: "LOBBY",
        revision: 1,
      }),
    );
    expect(launched.json().session.joinCode).toMatch(
      /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/,
    );
    expect(launched.json().session.joinPath).toBe(
      `/join/${launched.json().session.joinCode}`,
    );
  });

  it("returns the host lobby snapshot only to its owner", async () => {
    const owner = await register("owner@example.com");
    const quizId = await createQuiz(owner);
    const sessionId = (
      await app.inject({
        method: "POST",
        url: `/api/quizzes/${quizId}/sessions`,
        headers: { cookie: owner },
      })
    ).json().session.id;
    const stranger = await register("stranger@example.com");
    const snapshot = await app.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}/host`,
      headers: { cookie: owner },
    });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json().players).toEqual([]);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/sessions/${sessionId}/host`,
          headers: { cookie: stranger },
        })
      ).statusCode,
    ).toBe(404);
  });

  it("locks quiz editing and deletion until the lobby is cancelled", async () => {
    const cookie = await register("host@example.com");
    const quizId = await createQuiz(cookie);
    const sessionId = (
      await app.inject({
        method: "POST",
        url: `/api/quizzes/${quizId}/sessions`,
        headers: { cookie },
      })
    ).json().session.id;
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/api/quizzes/${quizId}`,
          headers: { cookie },
          payload: { ...quizInput, title: "Blocked update" },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/quizzes/${quizId}`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/sessions/${sessionId}`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/api/quizzes/${quizId}`,
          headers: { cookie },
          payload: { ...quizInput, title: "Allowed update" },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("does not let another creator launch or cancel the session", async () => {
    const owner = await register("owner@example.com");
    const quizId = await createQuiz(owner);
    const stranger = await register("stranger@example.com");
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/quizzes/${quizId}/sessions`,
          headers: { cookie: stranger },
        })
      ).statusCode,
    ).toBe(404);
    const sessionId = (
      await app.inject({
        method: "POST",
        url: `/api/quizzes/${quizId}/sessions`,
        headers: { cookie: owner },
      })
    ).json().session.id;
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/sessions/${sessionId}`,
          headers: { cookie: stranger },
        })
      ).statusCode,
    ).toBe(404);
  });

  it("allows only one active lobby for a quiz", async () => {
    const cookie = await register("host@example.com");
    const quizId = await createQuiz(cookie);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/quizzes/${quizId}/sessions`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/quizzes/${quizId}/sessions`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(409);
  });

  it("lets an anonymous player inspect and join an open lobby", async () => {
    const cookie = await register("host@example.com");
    const quizId = await createQuiz(cookie);
    const launched = await app.inject({
      method: "POST",
      url: `/api/quizzes/${quizId}/sessions`,
      headers: { cookie },
    });
    const { id: sessionId, joinCode } = launched.json().session;

    const lobby = await app.inject({
      method: "GET",
      url: `/api/lobbies/${joinCode.toLowerCase()}`,
    });
    expect(lobby.statusCode).toBe(200);
    expect(lobby.json().lobby).toEqual({
      joinCode,
      quizTitle: quizInput.title,
    });

    const joinedEvent = new Promise<unknown>((resolve) => {
      const unsubscribe = eventBus.subscribe(sessionId, (event) => {
        unsubscribe();
        resolve(event);
      });
    });
    const joined = await app.inject({
      method: "POST",
      url: `/api/lobbies/${joinCode}/players`,
      payload: { nickname: "  Ada  " },
    });
    expect(joined.statusCode).toBe(201);
    expect(joined.json()).toEqual(
      expect.objectContaining({
        sessionId,
        quizTitle: quizInput.title,
        player: expect.objectContaining({ nickname: "Ada" }),
        token: expect.stringMatching(/^[A-Za-z0-9_-]{40,}$/),
      }),
    );
    expect(await joinedEvent).toEqual(
      expect.objectContaining({
        type: "lobby_updated",
        revision: 2,
        payload: {
          players: [expect.objectContaining({ nickname: "Ada" })],
        },
      }),
    );

    const hostSnapshot = await app.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}/host`,
      headers: { cookie },
    });
    expect(hostSnapshot.json().players).toEqual([
      expect.objectContaining({ nickname: "Ada" }),
    ]);
    const stored = await pool.query<{ token_hash: string }>(
      "SELECT token_hash FROM players WHERE live_session_id = $1",
      [sessionId],
    );
    expect(stored.rows[0]!.token_hash).not.toBe(joined.json().token);
  });

  it("rejects duplicate nicknames without regard to case", async () => {
    const cookie = await register("host@example.com");
    const quizId = await createQuiz(cookie);
    const joinCode = (
      await app.inject({
        method: "POST",
        url: `/api/quizzes/${quizId}/sessions`,
        headers: { cookie },
      })
    ).json().session.joinCode;
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/lobbies/${joinCode}/players`,
          payload: { nickname: "Grace" },
        })
      ).statusCode,
    ).toBe(201);
    const duplicate = await app.inject({
      method: "POST",
      url: `/api/lobbies/${joinCode}/players`,
      payload: { nickname: "grace" },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({
      error: "That nickname is already taken.",
    });
  });

  it("rejects joining once the lobby state has moved on", async () => {
    const cookie = await register("host@example.com");
    const quizId = await createQuiz(cookie);
    const launched = await app.inject({
      method: "POST",
      url: `/api/quizzes/${quizId}/sessions`,
      headers: { cookie },
    });
    const { id: sessionId, joinCode } = launched.json().session;
    await pool.query(
      "UPDATE live_sessions SET state = 'QUESTION_OPEN' WHERE id = $1",
      [sessionId],
    );

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/lobbies/${joinCode}/players`,
          payload: { nickname: "Too late" },
        })
      ).statusCode,
    ).toBe(404);
  });

  it("starts the first question once and broadcasts no correctness data", async () => {
    const cookie = await register("host@example.com");
    const quizId = await createQuiz(cookie);
    const launched = await app.inject({
      method: "POST",
      url: `/api/quizzes/${quizId}/sessions`,
      headers: { cookie },
    });
    const { id: sessionId, joinCode } = launched.json().session;
    const joined = await app.inject({
      method: "POST",
      url: `/api/lobbies/${joinCode}/players`,
      payload: { nickname: "Ada" },
    });

    const stale = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/start`,
      headers: { cookie },
      payload: { expectedRevision: 1 },
    });
    expect(stale.statusCode).toBe(409);

    const openedEvent = new Promise<unknown>((resolve) => {
      const unsubscribe = eventBus.subscribe(sessionId, (event) => {
        unsubscribe();
        resolve(event);
      });
    });
    const started = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/start`,
      headers: { cookie },
      payload: { expectedRevision: 2 },
    });
    expect(started.statusCode).toBe(200);
    expect(started.json()).toEqual(
      expect.objectContaining({
        state: "QUESTION_OPEN",
        revision: 3,
        question: expect.objectContaining({
          prompt: quizInput.questions[0].prompt,
          position: 0,
          totalQuestions: 1,
          points: 1000,
          timeLimitSeconds: 20,
          answers: [
            expect.objectContaining({ text: "Yes", position: 0 }),
            expect.objectContaining({ text: "No", position: 1 }),
          ],
        }),
      }),
    );
    expect(JSON.stringify(started.json())).not.toContain("correct");
    expect(JSON.parse(JSON.stringify(await openedEvent))).toEqual(
      expect.objectContaining({
        type: "question_opened",
        revision: 3,
        payload: { question: started.json().question },
      }),
    );

    const playerSnapshot = await app.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}/player`,
      headers: { authorization: `Bearer ${joined.json().token}` },
    });
    expect(playerSnapshot.statusCode).toBe(200);
    expect(playerSnapshot.json().currentQuestion).toEqual(
      started.json().question,
    );
    expect(JSON.stringify(playerSnapshot.json())).not.toContain("correct");

    const earlyReveal = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/reveal`,
      headers: { cookie },
      payload: { expectedRevision: 3 },
    });
    expect(earlyReveal.statusCode).toBe(409);
    expect(earlyReveal.json()).toEqual({ error: "Answers are not open yet." });

    await openAnswers(started.json().question.roundId);

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/lobbies/${joinCode}/players`,
          payload: { nickname: "Too late" },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/sessions/${sessionId}/start`,
          headers: { cookie },
          payload: { expectedRevision: 3 },
        })
      ).statusCode,
    ).toBe(409);
    const persisted = await pool.query<{
      state: string;
      round_count: number;
    }>(
      `SELECT s.state,
              (SELECT count(*)::integer FROM question_rounds r WHERE r.live_session_id = s.id) AS round_count
         FROM live_sessions s WHERE s.id = $1`,
      [sessionId],
    );
    expect(persisted.rows[0]).toEqual({
      state: "QUESTION_OPEN",
      round_count: 1,
    });

    const countEvent = new Promise<unknown>((resolve) => {
      const unsubscribe = eventBus.subscribe(sessionId, (event) => {
        unsubscribe();
        resolve(event);
      });
    });
    const resultsEvent = new Promise<unknown>((resolve) => {
      const unsubscribe = eventBus.subscribe(sessionId, (event) => {
        if (event.type !== "results_revealed") return;
        unsubscribe();
        resolve(event);
      });
    });
    const submissionId = "00000000-0000-4000-8000-000000000099";
    const answerId = started.json().question.answers[0].id;
    const answer = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/answers`,
      headers: { authorization: `Bearer ${joined.json().token}` },
      payload: {
        submissionId,
        roundId: started.json().question.roundId,
        answerId,
      },
    });
    expect(answer.statusCode).toBe(200);
    expect(answer.json()).toEqual({ accepted: true });
    expect(JSON.stringify(answer.json())).not.toContain("correct");
    expect(await countEvent).toEqual({
      type: "answer_count_updated",
      revision: 3,
      payload: {
        roundId: started.json().question.roundId,
        answeredCount: 1,
        totalPlayers: 1,
      },
    });
    expect(await resultsEvent).toEqual(
      expect.objectContaining({
        type: "results_revealed",
        revision: 4,
        payload: {
          results: expect.objectContaining({
            answeredCount: 1,
            totalPlayers: 1,
          }),
        },
      }),
    );

    const replay = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/answers`,
      headers: { authorization: `Bearer ${joined.json().token}` },
      payload: {
        submissionId,
        roundId: started.json().question.roundId,
        answerId,
      },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual({ accepted: true });
    const changedAnswer = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/answers`,
      headers: { authorization: `Bearer ${joined.json().token}` },
      payload: {
        submissionId: "00000000-0000-4000-8000-000000000100",
        roundId: started.json().question.roundId,
        answerId: started.json().question.answers[1].id,
      },
    });
    expect(changedAnswer.statusCode).toBe(409);
    expect(changedAnswer.json()).toEqual({ error: "You already answered." });

    const hostProgress = await app.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}/host`,
      headers: { cookie },
    });
    expect(hostProgress.json().answerProgress).toEqual({
      answeredCount: 1,
      totalPlayers: 1,
    });
    expect(hostProgress.json()).toEqual(
      expect.objectContaining({
        session: expect.objectContaining({ state: "RESULTS", revision: 4 }),
        results: expect.objectContaining({ answeredCount: 1, totalPlayers: 1 }),
      }),
    );
    const recoveredPlayer = await app.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}/player`,
      headers: { authorization: `Bearer ${joined.json().token}` },
    });
    expect(recoveredPlayer.json()).toEqual(
      expect.objectContaining({
        currentQuestion: expect.objectContaining({
          roundId: started.json().question.roundId,
        }),
        submittedAnswerId: answerId,
        playerResult: {
          answerId,
          isCorrect: true,
          pointsAwarded: 1000,
        },
      }),
    );
    const storedAnswer = await pool.query<{
      is_correct: boolean;
      points_awarded: number;
    }>(
      "SELECT is_correct, points_awarded FROM answer_submissions WHERE id = $1",
      [submissionId],
    );
    expect(storedAnswer.rows[0]).toEqual({
      is_correct: true,
      points_awarded: 1000,
    });
  });

  it("requires a player before the host can start", async () => {
    const cookie = await register("host@example.com");
    const quizId = await createQuiz(cookie);
    const sessionId = (
      await app.inject({
        method: "POST",
        url: `/api/quizzes/${quizId}/sessions`,
        headers: { cookie },
      })
    ).json().session.id;
    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/start`,
      headers: { cookie },
      payload: { expectedRevision: 1 },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: "At least one player must join before starting.",
    });
  });

  it("uses the server deadline and player credential for answers", async () => {
    const cookie = await register("host@example.com");
    const quizId = await createQuiz(cookie);
    const launched = await app.inject({
      method: "POST",
      url: `/api/quizzes/${quizId}/sessions`,
      headers: { cookie },
    });
    const { id: sessionId, joinCode } = launched.json().session;
    const joined = await app.inject({
      method: "POST",
      url: `/api/lobbies/${joinCode}/players`,
      payload: { nickname: "Late Ada" },
    });
    const started = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/start`,
      headers: { cookie },
      payload: { expectedRevision: 2 },
    });
    const payload = {
      submissionId: "00000000-0000-4000-8000-000000000101",
      roundId: started.json().question.roundId,
      answerId: started.json().question.answers[0].id,
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/sessions/${sessionId}/answers`,
          payload,
        })
      ).statusCode,
    ).toBe(401);

    const tooEarly = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/answers`,
      headers: { authorization: `Bearer ${joined.json().token}` },
      payload,
    });
    expect(tooEarly.statusCode).toBe(409);
    expect(tooEarly.json()).toEqual({ error: "Answers are not open yet." });

    await pool.query(
      `UPDATE question_rounds
          SET opened_at = now() - interval '2 minutes',
              answers_available_at = now() - interval '2 minutes',
              closes_at = now() - interval '1 minute'
        WHERE id = $1`,
      [payload.roundId],
    );
    const expired = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/answers`,
      headers: { authorization: `Bearer ${joined.json().token}` },
      payload,
    });
    expect(expired.statusCode).toBe(409);
    expect(expired.json()).toEqual({ error: "Answering is closed." });
  });

  it("plays every question through reveal, leaderboard, and final podium", async () => {
    const cookie = await register("host@example.com");
    const fullQuiz = {
      ...quizInput,
      title: "Full game",
      questions: [
        quizInput.questions[0],
        {
          prompt: "Second question?",
          points: 500,
          timeLimitSeconds: 15,
          answers: [
            { text: "Wrong", correct: false },
            { text: "Right", correct: true },
          ],
        },
      ],
    };
    const quizId = await createQuiz(cookie, fullQuiz);
    const launched = await app.inject({
      method: "POST",
      url: `/api/quizzes/${quizId}/sessions`,
      headers: { cookie },
    });
    const { id: sessionId, joinCode } = launched.json().session;
    const ada = await app.inject({
      method: "POST",
      url: `/api/lobbies/${joinCode}/players`,
      payload: { nickname: "Ada" },
    });
    const grace = await app.inject({
      method: "POST",
      url: `/api/lobbies/${joinCode}/players`,
      payload: { nickname: "Grace" },
    });
    const eventTypes: string[] = [];
    const unsubscribe = eventBus.subscribe(sessionId, (event) =>
      eventTypes.push(event.type),
    );

    const first = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/start`,
      headers: { cookie },
      payload: { expectedRevision: 3 },
    });
    expect(first.json().question).toEqual(
      expect.objectContaining({ position: 0, totalQuestions: 2 }),
    );
    const firstQuestion = first.json().question;
    await openAnswers(firstQuestion.roundId);
    const submitted = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/sessions/${sessionId}/answers`,
        headers: { authorization: `Bearer ${ada.json().token}` },
        payload: {
          submissionId: "00000000-0000-4000-8000-000000000201",
          roundId: firstQuestion.roundId,
          answerId: firstQuestion.answers[0].id,
        },
      }),
      app.inject({
        method: "POST",
        url: `/api/sessions/${sessionId}/answers`,
        headers: { authorization: `Bearer ${grace.json().token}` },
        payload: {
          submissionId: "00000000-0000-4000-8000-000000000202",
          roundId: firstQuestion.roundId,
          answerId: firstQuestion.answers[1].id,
        },
      }),
    ]);
    expect(submitted.map((response) => response.statusCode)).toEqual([
      200, 200,
    ]);
    const firstReveal = await app.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}/host`,
      headers: { cookie },
    });
    expect(firstReveal.statusCode).toBe(200);
    expect(firstReveal.json().results).toEqual(
      expect.objectContaining({
        correctAnswerId: firstQuestion.answers[0].id,
        voteTotals: [
          { answerId: firstQuestion.answers[0].id, count: 1 },
          { answerId: firstQuestion.answers[1].id, count: 1 },
        ],
        answeredCount: 2,
        totalPlayers: 2,
        leaderboard: [
          expect.objectContaining({ rank: 1, nickname: "Ada", score: 1000 }),
          expect.objectContaining({ rank: 2, nickname: "Grace", score: 0 }),
        ],
      }),
    );
    const graceResult = await app.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}/player`,
      headers: { authorization: `Bearer ${grace.json().token}` },
    });
    expect(graceResult.json().playerResult).toEqual({
      answerId: firstQuestion.answers[1].id,
      isCorrect: false,
      pointsAwarded: 0,
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/sessions/${sessionId}/finish`,
          headers: { cookie },
          payload: { expectedRevision: 5 },
        })
      ).statusCode,
    ).toBe(409);

    const second = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/next`,
      headers: { cookie },
      payload: { expectedRevision: 5 },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().question).toEqual(
      expect.objectContaining({
        prompt: "Second question?",
        position: 1,
        totalQuestions: 2,
      }),
    );
    const secondQuestion = second.json().question;
    await openAnswers(secondQuestion.roundId);
    await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/answers`,
      headers: { authorization: `Bearer ${grace.json().token}` },
      payload: {
        submissionId: "00000000-0000-4000-8000-000000000203",
        roundId: secondQuestion.roundId,
        answerId: secondQuestion.answers[1].id,
      },
    });
    const secondReveal = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/reveal`,
      headers: { cookie },
      payload: { expectedRevision: 6 },
    });
    expect(secondReveal.statusCode).toBe(200);
    expect(secondReveal.json().results.leaderboard).toEqual([
      expect.objectContaining({ rank: 1, nickname: "Ada", score: 1000 }),
      expect.objectContaining({ rank: 2, nickname: "Grace", score: 500 }),
    ]);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/sessions/${sessionId}/next`,
          headers: { cookie },
          payload: { expectedRevision: 7 },
        })
      ).statusCode,
    ).toBe(409);

    const finished = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/finish`,
      headers: { cookie },
      payload: { expectedRevision: 7 },
    });
    expect(finished.statusCode).toBe(200);
    expect(finished.json()).toEqual(
      expect.objectContaining({
        state: "FINISHED",
        revision: 8,
        podium: [
          expect.objectContaining({ rank: 1, nickname: "Ada", score: 1000 }),
          expect.objectContaining({ rank: 2, nickname: "Grace", score: 500 }),
        ],
      }),
    );
    expect(eventTypes).toEqual([
      "question_opened",
      "answer_count_updated",
      "answer_count_updated",
      "results_revealed",
      "question_opened",
      "answer_count_updated",
      "results_revealed",
      "quiz_finished",
    ]);
    unsubscribe();
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/quizzes/${quizId}/sessions`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(201);
  });

  it("lets the creator cancel mid-quiz and discards only the live run", async () => {
    const cookie = await register("host@example.com");
    const quizId = await createQuiz(cookie);
    const launched = await app.inject({
      method: "POST",
      url: `/api/quizzes/${quizId}/sessions`,
      headers: { cookie },
    });
    const { id: sessionId, joinCode } = launched.json().session;
    const joined = await app.inject({
      method: "POST",
      url: `/api/lobbies/${joinCode}/players`,
      payload: { nickname: "Ada" },
    });
    const started = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/start`,
      headers: { cookie },
      payload: { expectedRevision: 2 },
    });
    await openAnswers(started.json().question.roundId);
    await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/answers`,
      headers: { authorization: `Bearer ${joined.json().token}` },
      payload: {
        submissionId: "00000000-0000-4000-8000-000000000301",
        roundId: started.json().question.roundId,
        answerId: started.json().question.answers[0].id,
      },
    });

    const endedEvent = new Promise<unknown>((resolve) => {
      const unsubscribe = eventBus.subscribe(sessionId, (event) => {
        unsubscribe();
        resolve(event);
      });
    });
    const cancelled = await app.inject({
      method: "DELETE",
      url: `/api/sessions/${sessionId}`,
      headers: { cookie },
    });
    expect(cancelled.statusCode).toBe(204);
    expect(await endedEvent).toEqual({
      type: "session_ended",
      payload: { reason: "cancelled_by_host" },
    });
    const counts = await pool.query<{
      sessions: number;
      players: number;
      rounds: number;
      submissions: number;
      quizzes: number;
    }>(
      `SELECT
        (SELECT count(*)::integer FROM live_sessions WHERE id = $1) AS sessions,
        (SELECT count(*)::integer FROM players WHERE live_session_id = $1) AS players,
        (SELECT count(*)::integer FROM question_rounds WHERE live_session_id = $1) AS rounds,
        (SELECT count(*)::integer FROM answer_submissions submission
          JOIN question_rounds round ON round.id = submission.question_round_id
         WHERE round.live_session_id = $1) AS submissions,
        (SELECT count(*)::integer FROM quizzes WHERE id = $2) AS quizzes`,
      [sessionId, quizId],
    );
    expect(counts.rows[0]).toEqual({
      sessions: 0,
      players: 0,
      rounds: 0,
      submissions: 0,
      quizzes: 1,
    });
  });
});

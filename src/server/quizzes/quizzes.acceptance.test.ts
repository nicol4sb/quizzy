import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { InMemoryRoomEventBus } from "../realtime/in-memory-room-event-bus.js";

config({ path: ".env.test", quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error("TEST_DATABASE_URL is required for quiz acceptance tests");
const pool = new Pool({ connectionString: databaseUrl, max: 3 });
const app = await buildApp({ pool, eventBus: new InMemoryRoomEventBus() });

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
  title: "European capitals",
  theme: "game-show",
  questions: [
    {
      prompt: "What is the capital of Switzerland?",
      points: 1000,
      timeLimitSeconds: 20,
      answers: [
        { text: "Geneva", correct: false },
        { text: "Bern", correct: true },
        { text: "Zurich", correct: false },
        { text: "Lausanne", correct: false },
      ],
    },
  ],
} as const;

describe("quiz authoring", () => {
  it("creates, lists, and loads a complete owned quiz", async () => {
    const cookie = await register("creator@example.com");
    const created = await app.inject({
      method: "POST",
      url: "/api/quizzes",
      headers: { cookie },
      payload: quizInput,
    });
    expect(created.statusCode).toBe(201);
    const quiz = created.json().quiz;
    expect(quiz.title).toBe(quizInput.title);
    expect(quiz.questions[0].answers).toHaveLength(4);
    expect(
      quiz.questions[0].answers.filter(
        (answer: { correct: boolean }) => answer.correct,
      ),
    ).toHaveLength(1);

    const listed = await app.inject({
      method: "GET",
      url: "/api/quizzes",
      headers: { cookie },
    });
    expect(listed.json().quizzes).toEqual([
      expect.objectContaining({ id: quiz.id, questionCount: 1 }),
    ]);
    const loaded = await app.inject({
      method: "GET",
      url: `/api/quizzes/${quiz.id}`,
      headers: { cookie },
    });
    expect(loaded.json().quiz.questions[0].prompt).toBe(
      quizInput.questions[0].prompt,
    );

    const counts = await pool.query(`SELECT
      (SELECT count(*)::integer FROM quizzes) AS quizzes,
      (SELECT count(*)::integer FROM questions) AS questions,
      (SELECT count(*)::integer FROM answer_options) AS answers`);
    expect(counts.rows[0]).toEqual({ quizzes: 1, questions: 1, answers: 4 });
  });

  it("updates the quiz transactionally and replaces its ordered questions", async () => {
    const cookie = await register("creator@example.com");
    const created = await app.inject({
      method: "POST",
      url: "/api/quizzes",
      headers: { cookie },
      payload: quizInput,
    });
    const quizId = created.json().quiz.id;
    const update = {
      ...quizInput,
      title: "Updated capitals",
      theme: "minimal",
      questions: [
        { ...quizInput.questions[0], prompt: "Updated first question" },
        { ...quizInput.questions[0], prompt: "A second question", points: 500 },
      ],
    };
    const updated = await app.inject({
      method: "PUT",
      url: `/api/quizzes/${quizId}`,
      headers: { cookie },
      payload: update,
    });
    expect(updated.statusCode).toBe(200);
    expect(
      updated
        .json()
        .quiz.questions.map((question: { prompt: string }) => question.prompt),
    ).toEqual(["Updated first question", "A second question"]);
    expect(
      (
        await pool.query(
          "SELECT count(*)::integer AS count FROM questions WHERE quiz_id = $1",
          [quizId],
        )
      ).rows[0].count,
    ).toBe(2);
  });

  it("rejects invalid quizzes without changing the saved quiz", async () => {
    const cookie = await register("creator@example.com");
    const created = await app.inject({
      method: "POST",
      url: "/api/quizzes",
      headers: { cookie },
      payload: quizInput,
    });
    const quizId = created.json().quiz.id;
    const invalid = {
      ...quizInput,
      title: "Should not persist",
      questions: [
        {
          ...quizInput.questions[0],
          answers: quizInput.questions[0].answers.map((answer) => ({
            ...answer,
            correct: false,
          })),
        },
      ],
    };
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/api/quizzes/${quizId}`,
          headers: { cookie },
          payload: invalid,
        })
      ).statusCode,
    ).toBe(400);
    const loaded = await app.inject({
      method: "GET",
      url: `/api/quizzes/${quizId}`,
      headers: { cookie },
    });
    expect(loaded.json().quiz.title).toBe(quizInput.title);
  });

  it("enforces ownership and deletes a quiz with all children", async () => {
    const ownerCookie = await register("owner@example.com");
    const created = await app.inject({
      method: "POST",
      url: "/api/quizzes",
      headers: { cookie: ownerCookie },
      payload: quizInput,
    });
    const quizId = created.json().quiz.id;
    const strangerCookie = await register("stranger@example.com");
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/quizzes/${quizId}`,
          headers: { cookie: strangerCookie },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/quizzes/${quizId}`,
          headers: { cookie: strangerCookie },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/quizzes/${quizId}`,
          headers: { cookie: ownerCookie },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await pool.query(
          "SELECT count(*)::integer AS count FROM answer_options",
        )
      ).rows[0].count,
    ).toBe(0);
  });

  it("rejects unauthenticated access", async () => {
    expect(
      (await app.inject({ method: "GET", url: "/api/quizzes" })).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/quizzes",
          payload: quizInput,
        })
      ).statusCode,
    ).toBe(401);
  });
});

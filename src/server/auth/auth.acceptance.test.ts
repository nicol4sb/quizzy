import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { InMemoryRoomEventBus } from "../realtime/in-memory-room-event-bus.js";

config({ path: ".env.test", quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    "TEST_DATABASE_URL is required for authentication acceptance tests",
  );
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

const credentials = {
  email: "Creator@Example.com",
  password: "correct horse battery staple",
};
const cookieFrom = (headers: Record<string, string | string[] | undefined>) => {
  const value = headers["set-cookie"];
  return (Array.isArray(value) ? value[0] : value)?.split(";", 1)[0];
};

describe("creator authentication", () => {
  it("registers, normalizes the email, creates a session, and returns the current creator", async () => {
    const registered = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: credentials,
    });
    expect(registered.statusCode).toBe(201);
    expect(registered.json().creator.email).toBe("creator@example.com");
    expect(registered.body).not.toContain(credentials.password);
    const cookie = cookieFrom(registered.headers);
    expect(cookie).toMatch(/^quizzy_session=/);
    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: cookie! },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().creator.email).toBe("creator@example.com");
  });

  it("rejects duplicate registration and invalid input", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: credentials,
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/register",
          payload: credentials,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/register",
          payload: { email: "bad", password: "short" },
        })
      ).statusCode,
    ).toBe(400);
  });

  it("logs in with valid credentials and rejects a wrong password", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: credentials,
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { ...credentials, email: credentials.email.toLowerCase() },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { ...credentials, password: "a very wrong password" },
        })
      ).statusCode,
    ).toBe(401);
  });

  it("logs out by deleting the session and clearing the cookie", async () => {
    const registered = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: credentials,
    });
    const cookie = cookieFrom(registered.headers)!;
    const loggedOut = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie },
    });
    expect(loggedOut.statusCode).toBe(204);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/auth/me",
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(401);
  });
});

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { findCurrentCreator } from "./current-creator.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createSession, hashSessionToken, sessionCookieName, sessionLifetimeSeconds, } from "./session.js";
const credentialsSchema = z
    .object({
    email: z
        .string()
        .trim()
        .email()
        .max(254)
        .transform((email) => email.toLowerCase()),
    password: z.string().min(12).max(128),
})
    .strict();
const cookieOptions = (secure) => ({
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure,
    maxAge: sessionLifetimeSeconds,
});
function publicCreator(creator) {
    return {
        id: creator.id,
        email: creator.email,
        createdAt: creator.created_at,
    };
}
function setSessionCookie(reply, token, secure) {
    reply.setCookie(sessionCookieName, token, cookieOptions(secure));
}
export async function registerAuthRoutes(app, database, secureCookies) {
    app.post("/api/auth/register", async (request, reply) => {
        const parsed = credentialsSchema.safeParse(request.body);
        if (!parsed.success)
            return reply.code(400).send({
                error: "Enter a valid email and a password of at least 12 characters.",
            });
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query(`INSERT INTO creators (id, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, email, created_at`, [
                randomUUID(),
                parsed.data.email,
                await hashPassword(parsed.data.password),
            ]);
            const creator = result.rows[0];
            if (!creator)
                throw new Error("Creator insertion returned no row");
            const token = await createSession(client, creator.id);
            await client.query("COMMIT");
            setSessionCookie(reply, token, secureCookies);
            return reply.code(201).send({ creator: publicCreator(creator) });
        }
        catch (error) {
            await client.query("ROLLBACK");
            if (error.code === "23505")
                return reply
                    .code(409)
                    .send({ error: "An account with this email already exists." });
            throw error;
        }
        finally {
            client.release();
        }
    });
    app.post("/api/auth/login", async (request, reply) => {
        const parsed = credentialsSchema.safeParse(request.body);
        if (!parsed.success)
            return reply
                .code(400)
                .send({ error: "Enter a valid email and password." });
        const result = await database.query("SELECT id, email, password_hash, created_at FROM creators WHERE email = $1", [parsed.data.email]);
        const creator = result.rows[0];
        if (!creator ||
            !(await verifyPassword(parsed.data.password, creator.password_hash)))
            return reply.code(401).send({ error: "Email or password is incorrect." });
        const token = await createSession(database, creator.id);
        setSessionCookie(reply, token, secureCookies);
        return { creator: publicCreator(creator) };
    });
    app.get("/api/auth/me", async (request, reply) => {
        const creator = await findCurrentCreator(database, request.cookies[sessionCookieName]);
        if (!creator)
            return reply.code(401).send({ error: "Not authenticated." });
        return { creator: publicCreator(creator) };
    });
    app.post("/api/auth/logout", async (request, reply) => {
        const token = request.cookies[sessionCookieName];
        if (token)
            await database.query("DELETE FROM creator_sessions WHERE token_hash = $1", [hashSessionToken(token)]);
        reply.clearCookie(sessionCookieName, {
            path: "/",
            httpOnly: true,
            sameSite: "strict",
            secure: secureCookies,
        });
        return reply.code(204).send();
    });
}
//# sourceMappingURL=routes.js.map
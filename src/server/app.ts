import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import path from "node:path";
import type { Pool } from "pg";
import type { RoomEventBus } from "./realtime/room-event-bus.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerQuizRoutes } from "./quizzes/routes.js";
import { registerRealtimeRoutes } from "./realtime/routes.js";
import { registerSessionRoutes } from "./sessions/routes.js";
import { registerRuntimeRoutes } from "./runtime/routes.js";
import { registerAnalyticsRoutes } from "./analytics/routes.js";

export type AppDependencies = {
  pool: Pick<Pool, "query" | "connect">;
  eventBus: RoomEventBus;
  logger?: boolean;
  serveClient?: boolean;
  secureCookies?: boolean;
};

export async function buildApp({
  pool,
  eventBus,
  logger = false,
  serveClient = false,
  secureCookies = false,
}: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger });
  await app.register(fastifyCookie);
  await app.register(fastifyWebsocket);
  app.get("/api/health", async () => ({ status: "ok" }));
  app.get("/api/ready", async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });
  app.decorate("roomEventBus", eventBus);
  await registerAuthRoutes(app, pool, secureCookies);
  await registerAnalyticsRoutes(app, pool);
  await registerQuizRoutes(app, pool);
  await registerSessionRoutes(app, pool);
  await registerRealtimeRoutes(app, pool);
  await registerRuntimeRoutes(app);

  if (serveClient) {
    const clientDirectory = path.resolve(process.cwd(), "dist/client");
    await app.register(fastifyStatic, { root: clientDirectory });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.method === "GET" && !request.url.startsWith("/api/"))
        return reply.sendFile("index.html");
      return reply.code(404).send({ error: "Not found" });
    });
  }
  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    roomEventBus: RoomEventBus;
  }
}

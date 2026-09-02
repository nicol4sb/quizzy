import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { findCurrentCreator } from "../auth/current-creator.js";
import { sessionCookieName } from "../auth/session.js";
import type { Database } from "../database/types.js";

const idSchema = z.string().uuid();
const eventSchema = z
  .object({
    eventType: z.string().trim().min(1).max(64),
    visitorId: z.string().trim().min(1).max(128).optional(),
    path: z.string().trim().min(1).max(512).optional(),
    quizId: idSchema.optional(),
    liveSessionId: idSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

type Admin = { id: string; is_admin: boolean };

async function currentAdmin(
  request: FastifyRequest,
  database: Database,
): Promise<Admin | undefined> {
  const creator = await findCurrentCreator(
    database,
    request.cookies[sessionCookieName],
  );
  return creator?.is_admin ? { id: creator.id, is_admin: true } : undefined;
}

export async function recordAnalyticsEvent(
  database: Database,
  event: {
    eventType: string;
    visitorId?: string;
    path?: string;
    creatorId?: string;
    quizId?: string;
    liveSessionId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await database.query(
      `INSERT INTO analytics_events
         (id, event_type, visitor_id, path, creator_id, quiz_id, live_session_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        randomUUID(),
        event.eventType,
        event.visitorId ?? null,
        event.path ?? null,
        event.creatorId ?? null,
        event.quizId ?? null,
        event.liveSessionId ?? null,
        JSON.stringify(event.metadata ?? {}),
      ],
    );
  } catch {
    // Analytics must never make a quiz or navigation request fail.
  }
}

export async function registerAnalyticsRoutes(
  app: FastifyInstance,
  database: Database,
): Promise<void> {
  app.post("/api/analytics/events", async (request, reply) => {
    const parsed = eventSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "Invalid analytics event." });
    const creator = await findCurrentCreator(
      database,
      request.cookies[sessionCookieName],
    );
    await recordAnalyticsEvent(database, {
      eventType: parsed.data.eventType,
      visitorId: parsed.data.visitorId,
      path: parsed.data.path ?? request.url.split("?", 1)[0],
      creatorId: creator?.id,
      quizId: parsed.data.quizId,
      liveSessionId: parsed.data.liveSessionId,
      metadata: parsed.data.metadata,
    });
    return reply.code(204).send();
  });

  app.get("/api/admin/analytics", async (request, reply) => {
    const admin = await currentAdmin(request, database);
    if (!admin)
      return reply.code(403).send({ error: "Admin access required." });

    const rawDays = Number(
      new URL(request.url, "http://localhost").searchParams.get("days") ?? 30,
    );
    const days = Number.isFinite(rawDays)
      ? Math.min(90, Math.max(1, Math.floor(rawDays)))
      : 30;
    const interval = `${days} days`;

    const [overview, daily, paths, eventTypes, quizzes, recent] =
      await Promise.all([
        database.query<{
          unique_visitors: number;
          page_views: number;
          quiz_views: number;
          solo_starts: number;
          live_sessions: number;
          players_joined: number;
          answers_submitted: number;
          creator_attempts: number;
        }>(
          `SELECT
             count(DISTINCT NULLIF(visitor_id, ''))::int AS unique_visitors,
             count(*) FILTER (WHERE event_type = 'page_view')::int AS page_views,
             count(*) FILTER (WHERE event_type = 'quiz_viewed')::int AS quiz_views,
             count(*) FILTER (WHERE event_type = 'solo_started')::int AS solo_starts,
             count(*) FILTER (WHERE event_type = 'live_session_created')::int AS live_sessions,
             count(*) FILTER (WHERE event_type = 'player_joined')::int AS players_joined,
             count(*) FILTER (WHERE event_type = 'answer_submitted')::int AS answers_submitted,
             count(*) FILTER (WHERE event_type IN ('create_started', 'quiz_created', 'quiz_updated'))::int AS creator_attempts
           FROM analytics_events
          WHERE occurred_at >= now() - $1::interval`,
          [interval],
        ),
        database.query<{ day: string; visits: number; events: number }>(
          `SELECT occurred_at::date::text AS day,
                  count(*) FILTER (WHERE event_type = 'page_view')::int AS visits,
                  count(*)::int AS events
             FROM analytics_events
            WHERE occurred_at >= now() - $1::interval
            GROUP BY occurred_at::date
            ORDER BY occurred_at::date`,
          [interval],
        ),
        database.query<{ path: string; views: number }>(
          `SELECT COALESCE(path, '/') AS path, count(*)::int AS views
             FROM analytics_events
            WHERE event_type = 'page_view'
              AND occurred_at >= now() - $1::interval
            GROUP BY COALESCE(path, '/')
            ORDER BY views DESC, path
            LIMIT 12`,
          [interval],
        ),
        database.query<{ event_type: string; count: number }>(
          `SELECT event_type, count(*)::int AS count
             FROM analytics_events
            WHERE occurred_at >= now() - $1::interval
            GROUP BY event_type
            ORDER BY count DESC, event_type
            LIMIT 16`,
          [interval],
        ),
        database.query<{
          id: string;
          title: string;
          play_count: number;
          views: number;
          solo_starts: number;
          live_sessions: number;
          answers: number;
        }>(
          `SELECT q.id, q.title, q.play_count,
                  count(e.id) FILTER (WHERE e.event_type = 'quiz_viewed')::int AS views,
                  count(e.id) FILTER (WHERE e.event_type = 'solo_started')::int AS solo_starts,
                  count(e.id) FILTER (WHERE e.event_type = 'live_session_created')::int AS live_sessions,
                  count(e.id) FILTER (WHERE e.event_type = 'answer_submitted')::int AS answers
             FROM quizzes q
             LEFT JOIN analytics_events e
               ON e.quiz_id = q.id
              AND e.occurred_at >= now() - $1::interval
            GROUP BY q.id
            ORDER BY views DESC, q.play_count DESC, q.updated_at DESC
            LIMIT 20`,
          [interval],
        ),
        database.query<{
          event_type: string;
          path: string | null;
          occurred_at: Date;
          quiz_title: string | null;
        }>(
          `SELECT e.event_type, e.path, e.occurred_at, q.title AS quiz_title
             FROM analytics_events e
             LEFT JOIN quizzes q ON q.id = e.quiz_id
            WHERE e.occurred_at >= now() - $1::interval
            ORDER BY e.occurred_at DESC
            LIMIT 20`,
          [interval],
        ),
      ]);

    const stats = overview.rows[0] ?? {
      unique_visitors: 0,
      page_views: 0,
      quiz_views: 0,
      solo_starts: 0,
      live_sessions: 0,
      players_joined: 0,
      answers_submitted: 0,
      creator_attempts: 0,
    };
    return {
      days,
      overview: {
        uniqueVisitors: stats.unique_visitors,
        pageViews: stats.page_views,
        quizViews: stats.quiz_views,
        soloStarts: stats.solo_starts,
        liveSessions: stats.live_sessions,
        playersJoined: stats.players_joined,
        answersSubmitted: stats.answers_submitted,
        creatorAttempts: stats.creator_attempts,
      },
      daily: daily.rows,
      paths: paths.rows,
      eventTypes: eventTypes.rows.map((row) => ({
        eventType: row.event_type,
        count: row.count,
      })),
      quizzes: quizzes.rows.map((row) => ({
        id: row.id,
        title: row.title,
        playCount: row.play_count,
        views: row.views,
        soloStarts: row.solo_starts,
        liveSessions: row.live_sessions,
        answers: row.answers,
      })),
      recent: recent.rows.map((row) => ({
        eventType: row.event_type,
        path: row.path,
        occurredAt: row.occurred_at,
        quizTitle: row.quiz_title,
      })),
    };
  });
}

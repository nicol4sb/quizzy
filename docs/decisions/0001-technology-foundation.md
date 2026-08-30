# ADR 0001: Technology foundation

Status: accepted

## Decision

Quizzy starts as one Node.js application process using TypeScript, Fastify, `@fastify/websocket`, React/Vite, PostgreSQL through `pg`, an explicit SQL schema, Zod, Vitest, ESLint, and Prettier. The production process serves the browser application, HTTP API, and WebSocket endpoint. nginx terminates TLS and proxies traffic to it.

## Rationale

This is a lean single-process alpha deployment with explicit HTTP, realtime, database, and browser boundaries. It avoids Docker, Redis, an ORM, server-side rendering, and separate services before they provide demonstrated value. The `RoomEventBus` uses memory initially and can later be backed by Redis without changing game logic or browser contracts.

The disposable alpha uses one canonical `database/schema.sql` rather than a versioned migration framework. The process transactionally applies this additive, idempotent schema under a PostgreSQL advisory lock before accepting traffic. Destructive or data-transforming production changes still require a separate deliberate migration.

## Consequences

- PostgreSQL is installed and operated separately on the VPS.
- Production frontend builds happen before deployment, not on the VPS.
- A process failure interrupts active WebSockets; player browsers reconnect with their existing anonymous credential and recover from an authoritative HTTP snapshot when the process returns.
- Multiple application instances require a shared event bus first.

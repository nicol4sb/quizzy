# Quizzy contributor guidance

Read `docs/architecture.md` and accepted records in `docs/decisions/` before changing behavior or dependencies.

## Invariants

- PostgreSQL is authoritative; WebSocket events are notifications.
- Mutations commit before their events are published.
- Use HTTP for commands and WebSockets for outbound live events.
- Do not send correct-answer information to players before reveal.
- Do not add AI, player accounts, reconnection, late joining, quiz versioning, Redis, Docker, or multiple-server deployment without an explicit scope decision.
- Keep API and game state horizontally scalable even though the MVP uses one process.

## Completion checks

Run `npm run check` for every slice. Add acceptance tests proving each slice's user-visible outcome, authorization, failure behavior, and concurrency invariants.

Database schema changes are kept as explicit SQL in `database/schema.sql`. During the disposable alpha, development databases may be recreated from that file. Any later production change must document its required `ALTER` statements alongside the code change.

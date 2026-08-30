# Local development

## Requirements

- Node.js 22.12 or newer
- npm
- PostgreSQL

## Setup

1. Copy `.env.example` to `.env` and change the PostgreSQL credentials.
2. Create the configured development database and user.
3. Run `npm install`.
4. Run `npm run dev` to start the Fastify server and Vite together. The server transactionally applies the additive, idempotent `database/schema.sql` before listening.
5. Open the Vite URL shown in the client log. For phone testing, use the network URL containing the laptop's LAN IP rather than `localhost`.

React and CSS changes use hot-module replacement. Server changes restart the Fastify process automatically. One `Ctrl+C` stops both processes.

Vite binds to `0.0.0.0` during development so another device on the same local network can connect. Fastify remains bound to `127.0.0.1` and is reached through Vite's API and WebSocket proxy. Do not expose the Vite port through an internet router.

The Vite development server proxies `/api` and `/ws` to the Node.js server. The individual commands remain available as `npm run dev:server` and `npm run dev:client`. Production uses one Node.js process to serve all three.

## Production artifact workflow

The production VPS uses the existing pull-and-restart deployment script, so it does not compile JavaScript. Build artifacts under `dist/client` and `dist/server` are intentionally tracked in Git. `npm run check` builds them as its final step. Before pushing a release, run the full check locally and commit the generated artifacts together with the source change:

```bash
npm run check
git add .
git commit -m "Describe the release"
git push origin main
```

The VPS must have its runtime dependencies installed once with `npm ci --omit=dev`. Repeat that manually whenever `package-lock.json` changes because the existing deployment script does not install dependencies. Keep the production `.env` outside Git. On restart, the server takes a PostgreSQL advisory transaction lock and applies the canonical schema before accepting traffic. Keep this file limited to additive, repeatable `CREATE ... IF NOT EXISTS` and `ALTER ... IF NOT EXISTS` operations; destructive or data-transforming migrations require a separate deliberate production procedure.

## Verification

- `npm run check` runs formatting, linting, type-checking, unit/integration tests, and production builds.
- Database integration tests added by later slices use the separate `quizzy_test` database. Never point tests at development or production data.

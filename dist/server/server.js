import "dotenv/config";
import { buildApp } from "./app.js";
import { readConfig } from "./config.js";
import { createDatabasePool } from "./database/pool.js";
import { InMemoryRoomEventBus } from "./realtime/in-memory-room-event-bus.js";
const config = readConfig();
const pool = createDatabasePool(config.DATABASE_URL);
const app = await buildApp({
    pool,
    eventBus: new InMemoryRoomEventBus(),
    logger: true,
    serveClient: config.SERVE_CLIENT,
    secureCookies: config.NODE_ENV === "production",
});
async function shutdown(signal) {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await pool.end();
    process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
await app.listen({ host: config.HOST, port: config.PORT });
//# sourceMappingURL=server.js.map
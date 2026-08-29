import { z } from "zod";
import { findCurrentCreator } from "../auth/current-creator.js";
import { sessionCookieName } from "../auth/session.js";
import { hashPlayerToken } from "../players/token.js";
const websocketQuery = z.discriminatedUnion("role", [
    z.object({ sessionId: z.string().uuid(), role: z.literal("host") }),
    z.object({
        sessionId: z.string().uuid(),
        role: z.literal("player"),
        token: z.string().min(20),
    }),
]);
async function isAuthorized(request, database) {
    const parsed = websocketQuery.safeParse(request.query);
    if (!parsed.success)
        return false;
    if (parsed.data.role === "host") {
        const creator = await findCurrentCreator(database, request.cookies[sessionCookieName]);
        if (!creator)
            return false;
        const result = await database.query(`SELECT 1 FROM live_sessions
        WHERE id = $1 AND host_creator_id = $2 AND state <> 'FINISHED'`, [parsed.data.sessionId, creator.id]);
        return Boolean(result.rowCount);
    }
    const result = await database.query(`SELECT 1 FROM players p
      JOIN live_sessions s ON s.id = p.live_session_id
     WHERE p.live_session_id = $1 AND p.token_hash = $2
       AND s.state <> 'FINISHED'`, [parsed.data.sessionId, hashPlayerToken(parsed.data.token)]);
    return Boolean(result.rowCount);
}
export async function registerRealtimeRoutes(app, database) {
    app.get("/ws", { websocket: true }, (socket, request) => {
        void (async () => {
            const parsed = websocketQuery.safeParse(request.query);
            if (!parsed.success || !(await isAuthorized(request, database))) {
                socket.close(1008, "Unauthorized");
                return;
            }
            const unsubscribe = app.roomEventBus.subscribe(parsed.data.sessionId, (event) => {
                if (socket.readyState === 1)
                    socket.send(JSON.stringify(event));
            });
            socket.once("close", unsubscribe);
            socket.send(JSON.stringify({ type: "connected" }));
        })().catch((error) => {
            request.log.error(error, "WebSocket authentication failed");
            socket.close(1011, "Server error");
        });
    });
}
//# sourceMappingURL=routes.js.map
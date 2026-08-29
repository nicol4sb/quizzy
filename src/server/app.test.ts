import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { InMemoryRoomEventBus } from "./realtime/in-memory-room-event-bus.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function fakePool(query: () => Promise<unknown>) {
  return { query } as never;
}

describe("application foundation", () => {
  it("reports HTTP liveness without requiring the database", async () => {
    const app = await buildApp({
      pool: fakePool(async () => ({})),
      eventBus: new InMemoryRoomEventBus(),
    });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("reports database readiness and unavailability", async () => {
    const ready = await buildApp({
      pool: fakePool(async () => ({})),
      eventBus: new InMemoryRoomEventBus(),
    });
    const unavailable = await buildApp({
      pool: fakePool(async () => Promise.reject(new Error("offline"))),
      eventBus: new InMemoryRoomEventBus(),
    });
    apps.push(ready, unavailable);
    expect(
      (await ready.inject({ method: "GET", url: "/api/ready" })).statusCode,
    ).toBe(200);
    expect(
      (await unavailable.inject({ method: "GET", url: "/api/ready" }))
        .statusCode,
    ).toBe(503);
  });

  it("accepts a WebSocket upgrade and sends its initial event", async () => {
    const app = await buildApp({
      pool: fakePool(async () => ({ rowCount: 1 })),
      eventBus: new InMemoryRoomEventBus(),
    });
    apps.push(app);
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string")
      throw new Error("Expected a TCP address");
    const event = await new Promise<string>((resolve, reject) => {
      const socket = new WebSocket(
        `ws://127.0.0.1:${address.port}/ws?sessionId=00000000-0000-4000-8000-000000000001&role=player&token=${"a".repeat(32)}`,
      );
      socket.once("message", (message) => {
        resolve(message.toString());
        socket.close();
      });
      socket.once("error", reject);
    });
    expect(JSON.parse(event)).toEqual({ type: "connected" });
  });
});

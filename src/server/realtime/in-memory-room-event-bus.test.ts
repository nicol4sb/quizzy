import { describe, expect, it, vi } from "vitest";
import { InMemoryRoomEventBus } from "./in-memory-room-event-bus.js";

describe("InMemoryRoomEventBus", () => {
  it("publishes only to subscribers in the addressed room", async () => {
    const bus = new InMemoryRoomEventBus();
    const correctRoom = vi.fn();
    const otherRoom = vi.fn();
    bus.subscribe("room-a", correctRoom);
    bus.subscribe("room-b", otherRoom);
    await bus.publish("room-a", { type: "test" });
    expect(correctRoom).toHaveBeenCalledWith({ type: "test" });
    expect(otherRoom).not.toHaveBeenCalled();
  });

  it("stops publishing after unsubscribe", async () => {
    const bus = new InMemoryRoomEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe("room-a", handler);
    unsubscribe();
    await bus.publish("room-a", { type: "test" });
    expect(handler).not.toHaveBeenCalled();
  });
});

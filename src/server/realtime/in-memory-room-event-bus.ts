import type {
  RoomEvent,
  RoomEventBus,
  RoomEventHandler,
  Unsubscribe,
} from "./room-event-bus.js";

export class InMemoryRoomEventBus implements RoomEventBus {
  readonly #rooms = new Map<string, Set<RoomEventHandler>>();

  async publish(roomId: string, event: RoomEvent): Promise<void> {
    for (const handler of this.#rooms.get(roomId) ?? []) handler(event);
  }

  subscribe(roomId: string, handler: RoomEventHandler): Unsubscribe {
    const handlers = this.#rooms.get(roomId) ?? new Set<RoomEventHandler>();
    handlers.add(handler);
    this.#rooms.set(roomId, handlers);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.#rooms.delete(roomId);
    };
  }
}

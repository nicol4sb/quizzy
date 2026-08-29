export class InMemoryRoomEventBus {
    #rooms = new Map();
    async publish(roomId, event) {
        for (const handler of this.#rooms.get(roomId) ?? [])
            handler(event);
    }
    subscribe(roomId, handler) {
        const handlers = this.#rooms.get(roomId) ?? new Set();
        handlers.add(handler);
        this.#rooms.set(roomId, handlers);
        return () => {
            handlers.delete(handler);
            if (handlers.size === 0)
                this.#rooms.delete(roomId);
        };
    }
}
//# sourceMappingURL=in-memory-room-event-bus.js.map
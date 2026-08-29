export type RoomEvent = Readonly<{
  type: string;
  revision?: number;
  payload?: unknown;
}>;
export type RoomEventHandler = (event: RoomEvent) => void;
export type Unsubscribe = () => void;

export interface RoomEventBus {
  publish(roomId: string, event: RoomEvent): Promise<void>;
  subscribe(roomId: string, handler: RoomEventHandler): Unsubscribe;
}

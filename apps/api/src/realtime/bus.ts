import { EventEmitter } from "node:events";

export type RealtimeEvent = {
  tenantId: string;
  topic: "events" | "availability" | "notifications" | "settings";
  payload: unknown;
};

const bus = new EventEmitter();
bus.setMaxListeners(200);

export function publish(event: RealtimeEvent) {
  bus.emit("message", event);
}

export function subscribe(listener: (event: RealtimeEvent) => void) {
  bus.on("message", listener);
  return () => bus.off("message", listener);
}

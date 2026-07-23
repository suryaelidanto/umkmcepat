// ponytail: used by discuss-turn-worker (Task 4) + preview SSE route (Task 5).
type ProgressEvent = { type: string; [key: string]: unknown };
type TurnState = "live" | "gone";

type Channel = {
  events: ProgressEvent[];
  subscribers: Set<(e: ProgressEvent) => void>;
};

const channels = new Map<string, Channel>();

export function publishProgress(turnId: string, event: ProgressEvent): void {
  let ch = channels.get(turnId);
  if (!ch) {
    ch = { events: [], subscribers: new Set() };
    channels.set(turnId, ch);
  }
  ch.events.push(event);
  for (const sub of ch.subscribers) {
    try {
      sub(event);
    } catch {
      /* swallow subscriber errors */
    }
  }
  if (event.type === "finish" || event.type === "error") {
    setTimeout(() => channels.delete(turnId), 30_000);
  }
}

export function subscribeProgress(
  turnId: string,
  onEvent: (e: ProgressEvent) => void,
): () => void {
  let ch = channels.get(turnId);
  if (!ch) {
    ch = { events: [], subscribers: new Set() };
    channels.set(turnId, ch);
  }
  for (const e of ch.events) {
    try {
      onEvent(e);
    } catch {
      /* swallow */
    }
  }
  ch.subscribers.add(onEvent);
  return () => {
    channels.get(turnId)?.subscribers.delete(onEvent);
  };
}

export function readTurnState(turnId: string): TurnState {
  return channels.has(turnId) ? "live" : "gone";
}

// Discuss progress bus: local buffer + Redis pub/sub for multi-process tails.
// Publish is fire-and-forget; DB poll on SSE covers Redis misses (see discuss-turn-sse-tail).

import { randomUUID } from "node:crypto";

import Redis from "ioredis";

import { devLog } from "@/lib/dev-log";
import { getRedisUrl } from "@/lib/redis-url";

export type DiscussProgressEvent = { type: string; [key: string]: unknown };

type TurnState = "live" | "gone";

type Channel = {
  events: DiscussProgressEvent[];
  subscribers: Set<(e: DiscussProgressEvent) => void>;
};

export type DiscussProgressBackend = {
  publish(turnId: string, event: DiscussProgressEvent): void;
  subscribe(
    turnId: string,
    onEvent: (e: DiscussProgressEvent) => void,
  ): () => void;
};

const MAX_BUFFERED_EVENTS = 500;
const CHANNEL_GRACE_MS = 30_000;
const REDIS_CHANNEL_PREFIX = "discuss-progress:";
const PROCESS_ID = randomUUID();

const channels = new Map<string, Channel>();

let testBackend: DiscussProgressBackend | null = null;
let redisPub: Redis | null = null;
let redisSub: Redis | null = null;
let redisInitFailed = false;
let pmessageHooked = false;

/** Test-only: inject a backend; null restores default Redis+local. */
export function __setDiscussProgressBackendForTests(
  backend: DiscussProgressBackend | null,
): void {
  testBackend = backend;
}

export function publishProgress(
  turnId: string,
  event: DiscussProgressEvent,
): void {
  if (testBackend) {
    testBackend.publish(turnId, event);
    return;
  }

  deliverLocal(turnId, event, { buffer: true, notifyLocal: true });

  void publishToRedis(turnId, event).catch((error) => {
    devLog("discuss-progress", "redis-publish-failed", {
      turnId,
      error: error instanceof Error ? error.message : "unknown",
    });
  });
}

/** Open channel early so the SSE tail can subscribe before the first event. */
export function ensureProgressChannel(turnId: string): void {
  if (testBackend) {
    return;
  }
  if (!channels.has(turnId)) {
    channels.set(turnId, { events: [], subscribers: new Set() });
  }
}

export function subscribeProgress(
  turnId: string,
  onEvent: (e: DiscussProgressEvent) => void,
  options?: { replayBuffered?: boolean },
): () => void {
  if (testBackend) {
    return testBackend.subscribe(turnId, onEvent);
  }

  ensureRedisSub();

  let ch = channels.get(turnId);
  if (!ch) {
    ch = { events: [], subscribers: new Set() };
    channels.set(turnId, ch);
  }
  const replayBuffered = options?.replayBuffered !== false;
  if (replayBuffered) {
    for (const e of ch.events) {
      try {
        onEvent(e);
      } catch {
        /* swallow */
      }
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

function deliverLocal(
  turnId: string,
  event: DiscussProgressEvent,
  opts: { buffer: boolean; notifyLocal: boolean },
): void {
  let ch = channels.get(turnId);
  if (!ch) {
    ch = { events: [], subscribers: new Set() };
    channels.set(turnId, ch);
  }
  if (opts.buffer) {
    ch.events.push(event);
    if (ch.events.length > MAX_BUFFERED_EVENTS) {
      ch.events.splice(0, ch.events.length - MAX_BUFFERED_EVENTS);
    }
  }
  if (opts.notifyLocal) {
    for (const sub of ch.subscribers) {
      try {
        sub(event);
      } catch {
        /* swallow subscriber errors */
      }
    }
  }
  if (event.type === "finish" || event.type === "error") {
    setTimeout(() => {
      channels.delete(turnId);
    }, CHANNEL_GRACE_MS);
  }
}

async function publishToRedis(
  turnId: string,
  event: DiscussProgressEvent,
): Promise<void> {
  if (redisInitFailed) {
    return;
  }
  const client = await getRedisPub();
  if (!client) {
    return;
  }
  const payload = JSON.stringify({ processId: PROCESS_ID, event });
  await client.publish(`${REDIS_CHANNEL_PREFIX}${turnId}`, payload);
}

function ensureRedisSub(): void {
  if (redisInitFailed || redisSub) {
    return;
  }
  try {
    redisSub = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    if (!pmessageHooked) {
      pmessageHooked = true;
      redisSub.on("pmessage", (_pattern, channel, message) => {
        if (!channel.startsWith(REDIS_CHANNEL_PREFIX)) {
          return;
        }
        const turnId = channel.slice(REDIS_CHANNEL_PREFIX.length);
        try {
          const parsed = JSON.parse(message) as {
            processId?: string;
            event?: DiscussProgressEvent;
          };
          if (parsed.processId === PROCESS_ID) {
            return;
          }
          if (!parsed.event || typeof parsed.event.type !== "string") {
            return;
          }
          // Cross-process: notify local subscribers; buffer for late local joins.
          deliverLocal(turnId, parsed.event, {
            buffer: true,
            notifyLocal: true,
          });
        } catch {
          /* ignore bad payloads */
        }
      });
    }
    void redisSub
      .connect()
      .then(() => redisSub?.psubscribe(`${REDIS_CHANNEL_PREFIX}*`))
      .catch((error) => {
        redisInitFailed = true;
        devLog("discuss-progress", "redis-sub-failed", {
          error: error instanceof Error ? error.message : "unknown",
        });
      });
  } catch (error) {
    redisInitFailed = true;
    devLog("discuss-progress", "redis-sub-init-failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

async function getRedisPub(): Promise<Redis | null> {
  if (redisInitFailed) {
    return null;
  }
  if (redisPub) {
    return redisPub;
  }
  try {
    redisPub = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    await redisPub.connect();
    return redisPub;
  } catch (error) {
    redisInitFailed = true;
    devLog("discuss-progress", "redis-pub-failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    redisPub = null;
    return null;
  }
}

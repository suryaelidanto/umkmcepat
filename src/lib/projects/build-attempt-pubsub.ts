import { randomUUID } from "node:crypto";

import Redis from "ioredis";

import { getRedisUrl } from "@/lib/redis-url";

export type BuildProgressEvent = {
  type:
    "progress" | "operation" | "energy" | "energy_exhausted" | "done" | "error";
  [key: string]: unknown;
};

type Channel = {
  events: BuildProgressEvent[];
  nextSeq: number;
  subscribers: Set<(event: BuildProgressEvent) => void>;
};

const CHANNEL_GRACE_MS = 60_000;
const REDIS_CHANNEL_PREFIX = "build-progress:";
const PROCESS_ID = randomUUID();

const channels = new Map<string, Channel>();
let redisPub: Redis | null = null;
let redisSub: Redis | null = null;
let redisInitFailed = false;
let pmessageHooked = false;

function getRedisPubClient(): Redis | null {
  if (redisInitFailed) {
    return null;
  }
  if (redisPub) {
    return redisPub;
  }
  try {
    const url = getRedisUrl();
    if (!url) {
      return null;
    }
    redisPub = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    redisPub.connect().catch(() => {
      redisPub = null;
      redisInitFailed = true;
    });
    return redisPub;
  } catch {
    redisInitFailed = true;
    return null;
  }
}

function getRedisSubClient(): Redis | null {
  if (redisInitFailed) {
    return null;
  }
  if (redisSub) {
    return redisSub;
  }
  try {
    const url = getRedisUrl();
    if (!url) {
      return null;
    }
    redisSub = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    redisSub
      .connect()
      .then(() => {
        if (!pmessageHooked && redisSub) {
          pmessageHooked = true;
          redisSub
            .psubscribe(`${REDIS_CHANNEL_PREFIX}*`)
            .catch(() => undefined);
          redisSub.on("pmessage", (_pattern, channelName, message) => {
            const attemptId = channelName.slice(REDIS_CHANNEL_PREFIX.length);
            try {
              const envelope = JSON.parse(message) as {
                processId: string;
                event: BuildProgressEvent;
              };
              if (envelope.processId === PROCESS_ID) {
                return;
              }
              const channel = channels.get(attemptId);
              if (channel) {
                channel.events.push(envelope.event);
                for (const sub of channel.subscribers) {
                  try {
                    sub(envelope.event);
                  } catch {
                    // ignore
                  }
                }
              }
            } catch {
              // ignore
            }
          });
        }
      })
      .catch(() => {
        redisSub = null;
        redisInitFailed = true;
      });
    return redisSub;
  } catch {
    redisInitFailed = true;
    return null;
  }
}

export function publishBuildProgress(
  attemptId: string,
  event: BuildProgressEvent,
): void {
  let channel = channels.get(attemptId);
  if (!channel) {
    channel = { events: [], nextSeq: 0, subscribers: new Set() };
    channels.set(attemptId, channel);
  }

  // `attemptId` + monotonic `seq` let a client that reads the same channel
  const stamped: BuildProgressEvent = {
    ...event,
    attemptId,
    seq: channel.nextSeq,
  };
  channel.nextSeq += 1;

  channel.events.push(stamped);
  for (const subscriber of channel.subscribers) {
    try {
      subscriber(stamped);
    } catch {
      // ignore subscriber error
    }
  }

  const pub = getRedisPubClient();
  if (pub) {
    try {
      pub
        .publish(
          `${REDIS_CHANNEL_PREFIX}${attemptId}`,
          JSON.stringify({ processId: PROCESS_ID, event: stamped }),
        )
        .catch(() => undefined);
    } catch {
      // ignore redis publish errors
    }
  }

  if (event.type === "done" || event.type === "error") {
    setTimeout(() => channels.delete(attemptId), CHANNEL_GRACE_MS);
  }
}

export function subscribeBuildProgress(
  attemptId: string,
  onEvent: (event: BuildProgressEvent) => void,
): () => void {
  getRedisSubClient();
  let channel = channels.get(attemptId);
  if (!channel) {
    channel = { events: [], nextSeq: 0, subscribers: new Set() };
    channels.set(attemptId, channel);
  }

  for (const event of channel.events) {
    try {
      onEvent(event);
    } catch {
      // ignore handler error
    }
  }
  channel.subscribers.add(onEvent);

  return () => {
    channels.get(attemptId)?.subscribers.delete(onEvent);
  };
}

export function readBuildProgressState(attemptId: string): "live" | "gone" {
  return channels.has(attemptId) ? "live" : "gone";
}

export function encodeSseEvent(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function createReadStreamFromChannel(attemptId: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let tailResolved = false;
      let resolveTail!: () => void;
      const tailDone = new Promise<void>((resolve) => {
        resolveTail = () => {
          if (!tailResolved) {
            tailResolved = true;
            resolve();
          }
        };
      });
      const writeSafe = (event: BuildProgressEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeSseEvent(event.type, event)));
        } catch {
          resolveTail();
        }
      };
      const unsubscribe = subscribeBuildProgress(attemptId, (event) => {
        writeSafe(event);
        if (event.type === "done" || event.type === "error") {
          resolveTail();
        }
      });

      const heartbeatTimer = setInterval(() => {
        if (tailResolved) {
          clearInterval(heartbeatTimer);
          return;
        }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          resolveTail();
        }
      }, 15_000);

      void tailDone.then(() => {
        clearInterval(heartbeatTimer);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // ignore stream already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

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
const channels = new Map<string, Channel>();

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
  // twice (POST body reader + late EventSource replay) drop events it already
  // rendered, without needing to know which reader delivered them.
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
      /* ignore subscriber errors */
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
  let channel = channels.get(attemptId);
  if (!channel) {
    channel = { events: [], nextSeq: 0, subscribers: new Set() };
    channels.set(attemptId, channel);
  }

  for (const event of channel.events) {
    try {
      onEvent(event);
    } catch {
      /* ignore subscriber errors */
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

      void tailDone.then(() => {
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
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

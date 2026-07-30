"use client";

import { useEffect, useRef } from "react";

export type BuildStreamTerminalKind = "done" | "error" | "closed";

export type BuildStreamEvent = {
  type:
    "progress" | "operation" | "energy" | "energy_exhausted" | "done" | "error";
  [key: string]: unknown;
};

export function parseBuildStreamEvent(
  type: BuildStreamEvent["type"],
  data: string,
): BuildStreamEvent | null {
  try {
    const payload = JSON.parse(data) as Record<string, unknown>;
    return { ...payload, type };
  } catch {
    return null;
  }
}

const BUILD_STREAM_EVENT_TYPES: BuildStreamEvent["type"][] = [
  "progress",
  "operation",
  "energy",
  "energy_exhausted",
  "done",
  "error",
];

export function useBuildAttemptStream({
  attemptId,
  enabled = true,
  onEvent,
  onTerminal,
  projectId,
}: {
  attemptId: string | null;
  enabled?: boolean;
  onEvent?: (event: BuildStreamEvent) => void;
  onTerminal?: (kind: BuildStreamTerminalKind) => void;
  projectId: string;
}): void {
  const onEventRef = useRef(onEvent);
  const onTerminalRef = useRef(onTerminal);
  onEventRef.current = onEvent;
  onTerminalRef.current = onTerminal;

  useEffect(() => {
    if (!enabled || !attemptId) {
      return;
    }

    const eventSource = new EventSource(
      `/api/projects/${projectId}/attempts/${attemptId}/stream`,
    );
    const handlers = BUILD_STREAM_EVENT_TYPES.map((type) => {
      const handler = (message: Event) => {
        const raw = message as MessageEvent<string>;
        const event = parseBuildStreamEvent(type, raw.data);
        if (!event) {
          return;
        }
        onEventRef.current?.(event);
        if (type === "done") {
          onTerminalRef.current?.("done");
          eventSource.close();
        } else if (type === "error") {
          onTerminalRef.current?.("error");
          eventSource.close();
        }
      };
      eventSource.addEventListener(type, handler);
      return { handler, type };
    });

    eventSource.onerror = () => {
      onTerminalRef.current?.("closed");
      eventSource.close();
    };

    return () => {
      for (const { handler, type } of handlers) {
        eventSource.removeEventListener(type, handler);
      }
      eventSource.close();
    };
  }, [attemptId, enabled, projectId]);
}

const NUDGE_AT = 3;
const HARD_CAP_AT = 5;

export type TrackResult = { nudge?: string; hardCap: boolean };

export function createLoopDetector() {
  const counts = new Map<string, number>();

  function key(tool: string, args: unknown): string {
    return `${tool}:${stableStringify(args)}`;
  }

  return {
    track(tool: string, args: unknown): TrackResult {
      const k = key(tool, args);
      const n = (counts.get(k) ?? 0) + 1;
      counts.set(k, n);
      if (n >= HARD_CAP_AT) {
        return {
          hardCap: true,
          nudge: `You've called ${tool} with the same arguments ${n} times. This is a hard loop cap — stop and finish now.`,
        };
      }
      if (n >= NUDGE_AT) {
        return {
          hardCap: false,
          nudge: `You've called ${tool} with the same arguments ${n} times. This is a loop — make concrete progress or finish now.`,
        };
      }
      return { hardCap: false };
    },
    reset(): void {
      counts.clear();
    },
    summary(): string {
      const repeated = [...counts.entries()].filter(([, n]) => {
        return n > 1;
      });
      if (!repeated.length) {
        return "No repeated tool calls.";
      }
      return (
        "Repeated calls:\n" +
        repeated.map(([k, n]) => `- ${k} ×${n}`).join("\n")
      );
    },
  };
}

export type StepTimer = { start(): { end(): number } };

export function createStepTimer(): StepTimer {
  return {
    start() {
      const t = Date.now();
      return {
        end() {
          return Date.now() - t;
        },
      };
    },
  };
}

function stableStringify(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value !== "object") {
    return String(value);
  }
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    return Object.keys(value as object)
      .sort()
      .reduce(
        (acc, k) => {
          (acc as Record<string, unknown>)[k] = sortKeys(
            (value as Record<string, unknown>)[k],
          );
          return acc;
        },
        {} as Record<string, unknown>,
      );
  }
  return value;
}

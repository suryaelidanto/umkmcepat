const NUDGE_AT = 3;
const HARD_CAP_AT = 5;
const REPLACE_FAIL_NUDGE_AT = 2;
const REPLACE_FAIL_HARD_AT = 3;
const READ_STORM_NUDGE_AT = 4;
const READ_STORM_HARD_AT = 6;

export type TrackResult = { nudge?: string; hardCap: boolean };

export function createLoopDetector() {
  const counts = new Map<string, number>();
  let consecutiveReplaceFails = 0;
  let consecutiveReadsWithoutWrite = 0;

  function key(tool: string, args: unknown): string {
    return `${tool}:${stableStringify(args)}`;
  }

  function merge(a: TrackResult, b: TrackResult): TrackResult {
    return {
      hardCap: a.hardCap || b.hardCap,
      nudge: b.nudge ?? a.nudge,
    };
  }

  return {
    track(tool: string, args: unknown): TrackResult {
      const k = key(tool, args);
      const n = (counts.get(k) ?? 0) + 1;
      counts.set(k, n);

      let result: TrackResult = { hardCap: false };
      if (n >= HARD_CAP_AT) {
        result = {
          hardCap: true,
          nudge: `You've called ${tool} with the same arguments ${n} times. This is a hard loop cap — stop and finish now.`,
        };
      } else if (n >= NUDGE_AT) {
        result = {
          hardCap: false,
          nudge: `You've called ${tool} with the same arguments ${n} times. This is a loop — make concrete progress or finish now.`,
        };
      }

      if (
        tool === "read_file" ||
        tool === "list_files" ||
        tool === "search_files"
      ) {
        consecutiveReadsWithoutWrite += 1;
        if (consecutiveReadsWithoutWrite >= READ_STORM_HARD_AT) {
          result = merge(result, {
            hardCap: true,
            nudge: `You read/listed ${consecutiveReadsWithoutWrite} times without writing. Hard stop — write_file src/routes/index.tsx (or the needed path) now.`,
          });
        } else if (consecutiveReadsWithoutWrite >= READ_STORM_NUDGE_AT) {
          result = merge(result, {
            hardCap: false,
            nudge: `You have read/listed ${consecutiveReadsWithoutWrite} times without a write. Stop exploring — call write_file on the home page or content files.`,
          });
        }
      } else if (tool === "write_file") {
        consecutiveReplaceFails = 0;
        consecutiveReadsWithoutWrite = 0;
      } else if (tool === "replace_in_file") {
        consecutiveReadsWithoutWrite = 0;
      } else if (tool === "check_app") {
        consecutiveReadsWithoutWrite = 0;
      }

      return result;
    },

    /** Call after a failed replace_in_file (does not double exact-repeat counts). */
    noteReplaceFailure(): TrackResult {
      consecutiveReplaceFails += 1;
      if (consecutiveReplaceFails >= REPLACE_FAIL_HARD_AT) {
        return {
          hardCap: true,
          nudge: `replace_in_file failed ${consecutiveReplaceFails} times in a row. Hard stop — use write_file with the FULL file content for this path instead of replace.`,
        };
      }
      if (consecutiveReplaceFails >= REPLACE_FAIL_NUDGE_AT) {
        return {
          hardCap: false,
          nudge: `replace_in_file failed ${consecutiveReplaceFails} times. Prefer write_file with the complete file contents for this path; do not keep searching for old_string.`,
        };
      }
      return { hardCap: false };
    },

    noteReplaceSuccess(): void {
      consecutiveReplaceFails = 0;
    },

    reset(): void {
      counts.clear();
      consecutiveReplaceFails = 0;
      consecutiveReadsWithoutWrite = 0;
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

export const MAX_VISITOR_JOBS = 3;

export type VisitorJobPriority = "primary" | "secondary";

export type VisitorJob = {
  id: string;
  goal: string;
  priority: VisitorJobPriority;
};

export type VisitorJobsParseResult =
  { ok: true; value: VisitorJob[] } | { ok: false; reason: string };

export function parseVisitorJobs(value: unknown): VisitorJobsParseResult {
  if (!Array.isArray(value)) {
    return { ok: false, reason: "visitor jobs must be an array" };
  }
  if (value.length > MAX_VISITOR_JOBS) {
    return {
      ok: false,
      reason: `visitor jobs support at most ${MAX_VISITOR_JOBS} jobs`,
    };
  }
  if (value.length === 0) {
    return { ok: true, value: [] };
  }

  const jobs: VisitorJob[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      return { ok: false, reason: "invalid visitor job" };
    }
    const input = candidate as Record<string, unknown>;
    const id = normalizeVisitorJobId(input.id);
    if (!id) {
      return { ok: false, reason: "visitor job id required" };
    }
    if (ids.has(id)) {
      return { ok: false, reason: `duplicate visitor job id: ${id}` };
    }
    const goal = normalizeVisitorJobGoal(input.goal);
    if (!goal) {
      return { ok: false, reason: `visitor job goal required: ${id}` };
    }
    if (input.priority !== "primary" && input.priority !== "secondary") {
      return {
        ok: false,
        reason: `invalid visitor job priority: ${String(input.priority)}`,
      };
    }
    ids.add(id);
    jobs.push({ id, goal, priority: input.priority });
  }

  if (jobs.filter((job) => job.priority === "primary").length !== 1) {
    return {
      ok: false,
      reason: "visitor jobs require exactly one primary job",
    };
  }
  return { ok: true, value: jobs };
}

export function normalizeVisitorJobs(value: unknown): VisitorJob[] {
  const parsed = parseVisitorJobs(value);
  return parsed.ok ? parsed.value : [];
}

function normalizeVisitorJobId(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64)
    : "";
}

function normalizeVisitorJobGoal(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, 160)
    : "";
}

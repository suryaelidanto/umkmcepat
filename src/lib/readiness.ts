import { prisma } from "@/lib/prisma";

const READINESS_TIMEOUT_MS = 2_000;

type ReadinessStatus = "not_ready" | "ready";

let activeDatabaseProbe: Promise<unknown> | null = null;
let lastReadinessStatus: ReadinessStatus | null = null;

export async function assertDatabaseReady() {
  try {
    await withReadinessTimeout(getDatabaseProbe());
    reportReadinessTransition("ready");
  } catch (error) {
    reportReadinessTransition(
      "not_ready",
      error instanceof ReadinessTimeoutError ? "timeout" : "database_error",
    );
    throw error;
  }
}

function getDatabaseProbe() {
  if (activeDatabaseProbe) {
    return activeDatabaseProbe;
  }

  const probe = Promise.resolve(prisma.$queryRaw`SELECT 1`);
  activeDatabaseProbe = probe;
  void probe.then(clearActiveProbe, clearActiveProbe);

  function clearActiveProbe() {
    if (activeDatabaseProbe === probe) {
      activeDatabaseProbe = null;
    }
  }

  return probe;
}

async function withReadinessTimeout<T>(promise: Promise<T>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new ReadinessTimeoutError()),
          READINESS_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function reportReadinessTransition(
  status: ReadinessStatus,
  reason?: "database_error" | "timeout",
) {
  if (lastReadinessStatus === status) {
    return;
  }

  lastReadinessStatus = status;

  if (status === "ready") {
    console.warn("[health:ready] critical dependencies are ready.");
    return;
  }

  console.error(`[health:ready] database unavailable (${reason}).`);
}

class ReadinessTimeoutError extends Error {
  constructor() {
    super("Readiness check timed out.");
    this.name = "ReadinessTimeoutError";
  }
}

export function resetReadinessStateForTests() {
  activeDatabaseProbe = null;
  lastReadinessStatus = null;
}

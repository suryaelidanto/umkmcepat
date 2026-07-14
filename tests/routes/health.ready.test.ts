import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryRawMock } = vi.hoisted(() => ({ queryRawMock: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: queryRawMock },
}));

import { getHandler } from "./_handler";

import { resetReadinessStateForTests } from "@/lib/readiness";
import { Route } from "@/routes/api.health.ready";

const GET = getHandler(Route, "GET");

describe("readiness route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetReadinessStateForTests();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("is ready only when the database responds", async () => {
    queryRawMock.mockResolvedValueOnce([{ ok: 1 }]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      checks: { database: "ok" },
      status: "ready",
    });
  });

  it("returns a bounded retryable failure when the database is unavailable", async () => {
    queryRawMock.mockRejectedValueOnce(new Error("database down"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    await expect(response.json()).resolves.toEqual({
      checks: { database: "unavailable" },
      status: "not_ready",
    });
    expect(console.error).toHaveBeenCalledWith(
      "[health:ready] database unavailable (database_error).",
    );
  });

  it("times out without accumulating database probes while one is hung", async () => {
    vi.useFakeTimers();
    queryRawMock.mockReturnValue(new Promise(() => undefined));

    const firstResponsePromise = GET();
    await vi.advanceTimersByTimeAsync(2_000);
    const firstResponse = await firstResponsePromise;

    const secondResponsePromise = GET();
    await vi.advanceTimersByTimeAsync(2_000);
    const secondResponse = await secondResponsePromise;

    expect(firstResponse.status).toBe(503);
    expect(secondResponse.status).toBe(503);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      "[health:ready] database unavailable (timeout).",
    );
  });
});

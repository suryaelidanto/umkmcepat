import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchRuntime,
  getRuntimeFetchTimeoutMs,
} from "@/lib/projects/runtime-network";

describe("runtime network policy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("uses bounded configurable deadlines for health and proxy calls", () => {
    expect(getRuntimeFetchTimeoutMs("health")).toBe(2_000);
    expect(getRuntimeFetchTimeoutMs("proxy")).toBe(15_000);

    vi.stubEnv("PROJECT_RUNTIME_HEALTH_TIMEOUT_MS", "50");
    vi.stubEnv("PROJECT_RUNTIME_PROXY_TIMEOUT_MS", "999999");

    expect(getRuntimeFetchTimeoutMs("health")).toBe(500);
    expect(getRuntimeFetchTimeoutMs("proxy")).toBe(30_000);
  });

  it("combines caller cancellation with the runtime deadline", async () => {
    const caller = new AbortController();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_input, init) => {
        expect(init?.cache).toBe("no-store");
        expect(init?.signal).toBeInstanceOf(AbortSignal);

        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason);
          });
        });
      });
    const pending = fetchRuntime("http://127.0.0.1:65535", {
      kind: "proxy",
      signal: caller.signal,
    });

    caller.abort(new Error("client disconnected"));

    await expect(pending).rejects.toThrow("client disconnected");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

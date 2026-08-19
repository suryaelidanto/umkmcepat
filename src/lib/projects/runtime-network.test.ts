import { afterEach, describe, expect, it, vi } from "vitest";

import {
  invalidateSettingCache,
  primeSettingCache,
} from "@/lib/config/app-settings";
import {
  fetchRuntime,
  getRuntimeFetchTimeoutMs,
} from "@/lib/projects/runtime-network";

vi.mock("@/lib/prisma", () => {
  const store = new Map<string, unknown>();
  return {
    prisma: {
      appSetting: {
        findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
          store.has(where.key) ? { value: store.get(where.key) } : null,
        ),
        findMany: vi.fn(async () =>
          [...store.entries()].map(([key, value]) => ({ key, value })),
        ),
        upsert: vi.fn(
          async (args: {
            where: { key: string };
            create: { value: unknown };
          }) => {
            store.set(args.where.key, args.create.value);
            return { value: args.create.value };
          },
        ),
        delete: vi.fn(async ({ where }: { where: { key: string } }) => {
          store.delete(where.key);
          return null;
        }),
      },
    },
  };
});

describe("runtime network policy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("uses bounded configurable deadlines for health and proxy calls", () => {
    expect(getRuntimeFetchTimeoutMs("health")).toBe(2_000);
    expect(getRuntimeFetchTimeoutMs("proxy")).toBe(15_000);
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

describe("runtime timeouts are DB-first", () => {
  afterEach(() => {
    invalidateSettingCache();
    delete process.env.PROJECT_RUNTIME_PROXY_TIMEOUT_MS;
  });

  it("prefers the DB value over env", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "runtime.proxy_timeout_ms" },
      create: {
        key: "runtime.proxy_timeout_ms",
        category: "runtime",
        value: 5_000,
      },
      update: { value: 5_000 },
    });
    process.env.PROJECT_RUNTIME_PROXY_TIMEOUT_MS = "20000";
    invalidateSettingCache();
    await primeSettingCache();

    expect(getRuntimeFetchTimeoutMs("proxy")).toBe(5_000);
  });

  it("clamps an out-of-range DB value to the policy max", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "runtime.proxy_timeout_ms" },
      create: {
        key: "runtime.proxy_timeout_ms",
        category: "runtime",
        value: 999_999,
      },
      update: { value: 999_999 },
    });
    invalidateSettingCache();
    await primeSettingCache();

    expect(getRuntimeFetchTimeoutMs("proxy")).toBe(30_000);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const instances: Array<{
  connect: ReturnType<typeof vi.fn>;
  handlers: Map<string, () => void>;
  publish: ReturnType<typeof vi.fn>;
  psubscribe: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(function RedisMock() {
    const instance = {
      connect: vi.fn(async () => undefined),
      handlers: new Map<string, () => void>(),
      publish: vi.fn(async () => 1),
      psubscribe: vi.fn(async () => undefined),
      on: vi.fn((event: string, handler: () => void) => {
        instance.handlers.set(event, handler);
        return instance;
      }),
    };
    instances.push(instance);
    return instance;
  }),
}));

vi.mock("@/lib/redis-url", () => ({
  getRedisUrl: () => "redis://localhost:6379",
}));

describe("discuss progress Redis reconnect", () => {
  beforeEach(() => {
    instances.length = 0;
    vi.resetModules();
  });

  it("recreates a cached Redis publisher after socket close", async () => {
    const { publishProgress } = await import("./discuss-turn-pubsub");

    publishProgress("t1", { type: "text-delta", delta: "a" });
    await vi.waitFor(() => expect(instances).toHaveLength(1));

    instances[0].handlers.get("close")?.();
    publishProgress("t1", { type: "text-delta", delta: "b" });

    await vi.waitFor(() => expect(instances).toHaveLength(2));
  });
});

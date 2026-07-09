import { describe, expect, it, vi } from "vitest";

describe("AI observability", () => {
  it("loads instrumentation outside the edge runtime", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_RUNTIME", undefined);

    await expect(import("../../instrumentation")).resolves.toHaveProperty(
      "register",
    );

    vi.unstubAllEnvs();
  });
});

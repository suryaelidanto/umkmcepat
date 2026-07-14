import { describe, expect, it, vi } from "vitest";

describe("AI observability", () => {
  it("exposes a register entry point for server startup", async () => {
    vi.resetModules();

    await expect(import("@/lib/instrumentation")).resolves.toHaveProperty(
      "register",
    );
  });
});

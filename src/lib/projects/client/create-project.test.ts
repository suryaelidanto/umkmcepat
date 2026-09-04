import { afterEach, describe, expect, it, vi } from "vitest";

import { createProjectApi } from "./create-project";

describe("createProjectApi", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("successfully parses valid project creation response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          assetIds: ["a1"],
          id: "p1",
          path: "/projects/p1",
          projectCount: 1,
          projectLimit: 3,
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      ),
    );

    const result = await createProjectApi({
      prompt: "Buat website toko kue",
      idempotencyKey: "idem_123",
      assetIds: ["a1"],
    });

    expect(result).toEqual({
      assetIds: ["a1"],
      id: "p1",
      path: "/projects/p1",
      projectCount: 1,
      projectLimit: 3,
    });
  });

  it("throws error when server responds with 400 and error message", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "Prompt terlalu pendek.",
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 400,
        },
      ),
    );

    await expect(
      createProjectApi({
        prompt: "Pendek",
        idempotencyKey: "idem_123",
      }),
    ).rejects.toThrow("Prompt terlalu pendek.");
  });

  it("throws error when response is not JSON", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response("Gateway Timeout", {
        headers: { "Content-Type": "text/html" },
        status: 504,
      }),
    );

    await expect(
      createProjectApi({
        prompt: "Valid prompt but 504",
        idempotencyKey: "idem_123",
      }),
    ).rejects.toThrow("Gagal membuat website.");
  });
});

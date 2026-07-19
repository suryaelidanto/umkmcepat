import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { signOut } from "./auth-client";
import {
  applyPatches,
  fetchJson,
  restoreSnapshots,
  type CachePatch,
} from "./query-client";

vi.mock("./auth-client", () => ({
  signOut: vi.fn().mockResolvedValue(undefined),
}));

describe("useCacheMutation helpers", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("applies patches in order and returns a new reference", () => {
    const initial = { count: 6, limit: 5, overLimit: true };
    const patches: CachePatch[] = [
      {
        queryKey: ["projects"],
        updater: (previous: unknown, _variables: void) => {
          const data = previous as {
            count: number;
            limit: number;
            overLimit: boolean;
          };
          return {
            ...data,
            count: data.count - 1,
            overLimit: data.count - 1 > data.limit,
          };
        },
      },
    ];

    const next = applyPatches(initial, patches, undefined);

    expect(next).toEqual({ count: 5, limit: 5, overLimit: false });
    expect(next).not.toBe(initial);
  });

  it("restores snapshots by writing the captured value back to the cache", () => {
    const client = new QueryClient();
    const key = ["projects"];
    const original = { count: 6, limit: 5, overLimit: true };
    client.setQueryData(key, original);

    const snapshots = new Map<string, unknown>([
      [JSON.stringify(key), original],
    ]);
    client.setQueryData(key, { count: 5, limit: 5, overLimit: false });

    restoreSnapshots(snapshots, client);

    expect(client.getQueryData(key)).toEqual(original);
  });

  describe("fetchJson 401 interception", () => {
    it("triggers signOut when a request returns 401 Unauthorized", async () => {
      // Mock window to simulate client-side environment
      vi.stubGlobal("window", {});

      const mockResponse = new Response(
        JSON.stringify({ message: "Unauthorized" }),
        {
          status: 401,
          statusText: "Unauthorized",
        },
      );
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

      await expect(fetchJson("/api/projects")).rejects.toThrow("Unauthorized");

      // Verify signOut was triggered
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
      vi.unstubAllGlobals();
    });

    it("does not trigger signOut for auth endpoints returning 401", async () => {
      vi.stubGlobal("window", {});

      const mockResponse = new Response(
        JSON.stringify({ message: "Unauthorized" }),
        {
          status: 401,
          statusText: "Unauthorized",
        },
      );
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

      await expect(fetchJson("/api/auth/csrf")).rejects.toThrow("Unauthorized");

      expect(signOut).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });
});

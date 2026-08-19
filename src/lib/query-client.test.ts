import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADMIN_SUMMARY_POLL_MS,
  ADMIN_WAITLIST_POLL_MS,
  applyPatches,
  fetchJson,
  invalidateAdminWaitlistData,
  queryKeys,
  restoreSnapshots,
  waitlistPagePollInterval,
  waitlistPendingPollInterval,
  WAITLIST_PENDING_POLL_MS,
  type CachePatch,
} from "./query-client";

import { signOut } from "@/lib/auth/auth-client";

vi.mock("@/lib/auth/auth-client", () => ({
  signOut: vi.fn().mockResolvedValue(undefined),
}));

function ownStatus(status: string) {
  return {
    businessName: "",
    businessType: null,
    id: "entry-1",
    rejectionReason: null,
    status,
    story: "",
  };
}

describe("waitlistPendingPollInterval", () => {
  it("polls only while gate is open and own entry is pending", () => {
    expect(waitlistPendingPollInterval(undefined)).toBe(false);
    expect(waitlistPendingPollInterval({ status: "approved" })).toBe(false);
    expect(
      waitlistPendingPollInterval({
        status: null,
        own: ownStatus("rejected"),
      }),
    ).toBe(false);
    expect(
      waitlistPendingPollInterval({
        status: null,
        own: null,
      }),
    ).toBe(false);
    expect(
      waitlistPendingPollInterval({
        status: null,
        own: ownStatus("pending"),
      }),
    ).toBe(WAITLIST_PENDING_POLL_MS);
    expect(
      waitlistPendingPollInterval({
        status: null,
        own: ownStatus("waitlisted"),
      }),
    ).toBe(WAITLIST_PENDING_POLL_MS);
  });
});

describe("waitlist query freshness", () => {
  it("stops submitted polling after a terminal server decision", () => {
    expect(
      waitlistPagePollInterval(
        { status: "approved", own: ownStatus("approved") },
        true,
      ),
    ).toBe(false);
    expect(
      waitlistPagePollInterval(
        { status: null, own: ownStatus("rejected") },
        true,
      ),
    ).toBe(false);
    expect(waitlistPagePollInterval({ status: null, own: null }, true)).toBe(
      WAITLIST_PENDING_POLL_MS,
    );
  });

  it("uses bounded user and admin polling intervals", () => {
    expect(WAITLIST_PENDING_POLL_MS).toBe(15_000);
    expect(ADMIN_WAITLIST_POLL_MS).toBe(15_000);
    expect(ADMIN_SUMMARY_POLL_MS).toBe(30_000);
  });

  it("invalidates the active admin and user waitlist surfaces", async () => {
    const client = new QueryClient();
    const invalidate = vi
      .spyOn(client, "invalidateQueries")
      .mockResolvedValue(undefined);

    await invalidateAdminWaitlistData(client);

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.adminWaitlist,
      refetchType: "active",
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.adminNavCounts,
      refetchType: "active",
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.adminOverview,
      refetchType: "active",
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.waitlistStatus,
      refetchType: "active",
    });
    expect(invalidate).toHaveBeenCalledTimes(4);
  });
});

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

    it("triggers signOut for protected user endpoints returning 401", async () => {
      for (const path of ["/api/user/credits", "/api/support/unread-count"]) {
        vi.stubGlobal("window", {});
        const mockResponse = new Response(
          JSON.stringify({ message: "Unauthorized" }),
          { status: 401, statusText: "Unauthorized" },
        );
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

        await expect(fetchJson(path)).rejects.toThrow("Unauthorized");
        expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
        vi.clearAllMocks();
        vi.unstubAllGlobals();
      }
    });
  });
});

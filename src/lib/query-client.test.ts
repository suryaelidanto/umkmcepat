import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  applyPatches,
  restoreSnapshots,
  type CachePatch,
} from "./query-client";

describe("useCacheMutation helpers", () => {
  it("applies patches in order and returns a new reference", () => {
    const initial = { count: 6, limit: 5, overLimit: true };
    const patches: CachePatch[] = [
      {
        queryKey: ["projects"],
        updater: (previous: unknown) => {
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

    const next = applyPatches(initial, patches);

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
});

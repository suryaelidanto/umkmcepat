import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { readProjectLimitFromCache } from "@/lib/projects/use-project-limit";
import {
  applyPatches,
  fetchJson,
  queryKeys,
  restoreSnapshots,
  type CachePatch,
} from "@/lib/query-client";

type ProjectsPage = {
  projectCount: number;
  projectLimit: number;
  overProjectLimit: boolean;
  projects: Array<{ id: string; title: string }>;
};

function seedCache(client: QueryClient, firstPage: ProjectsPage): void {
  client.setQueryData(queryKeys.projects, {
    pages: [firstPage],
    pageParams: [null],
  });
}

function buildDeletePatch(deletedId: string): CachePatch {
  return {
    queryKey: queryKeys.projects,
    updater: (previous) => {
      const data = previous as
        | {
            pages: ProjectsPage[];
            pageParams: unknown[];
          }
        | undefined;

      if (!data) {
        return data;
      }

      return {
        ...data,
        pages: data.pages.map((page) => {
          const nextCount = Math.max(0, page.projectCount - 1);
          return {
            ...page,
            projectCount: nextCount,
            overProjectLimit: nextCount > page.projectLimit,
            projects: page.projects.filter(
              (project) => project.id !== deletedId,
            ),
          };
        }),
      };
    },
  };
}

describe("homepage cache consistency", () => {
  it("optimistic delete drops count and clears the over-limit banner", () => {
    const client = new QueryClient();
    seedCache(client, {
      projectCount: 6,
      projectLimit: 5,
      overProjectLimit: true,
      projects: [{ id: "p1", title: "Toko A" }],
    });

    const snapshot = client.getQueryData(queryKeys.projects);
    const next = applyPatches(snapshot, [buildDeletePatch("p1")], undefined);
    client.setQueryData(queryKeys.projects, next);

    expect(readProjectLimitFromCache(next)).toEqual({
      count: 5,
      limit: 5,
      overLimit: false,
    });
  });

  it("rollback restores the original cache entry on error", () => {
    const client = new QueryClient();
    const original = {
      projectCount: 6,
      projectLimit: 5,
      overProjectLimit: true,
      projects: [{ id: "p1", title: "Toko A" }],
    } satisfies ProjectsPage;
    seedCache(client, original);

    const snapshotMap = new Map<string, unknown>([
      [
        JSON.stringify(queryKeys.projects),
        client.getQueryData(queryKeys.projects),
      ],
    ]);
    client.setQueryData(queryKeys.projects, {
      pages: [
        {
          ...original,
          projectCount: 5,
          overProjectLimit: false,
          projects: [],
        },
      ],
      pageParams: [null],
    });

    restoreSnapshots(snapshotMap, client);

    expect(
      readProjectLimitFromCache(client.getQueryData(queryKeys.projects)),
    ).toEqual({
      count: 6,
      limit: 5,
      overLimit: true,
    });
  });

  it("fetchJson handles 401 by throwing a parseable error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "no" }), {
        status: 401,
      })) as typeof fetch;

    try {
      await expect(fetchJson("/api/projects")).rejects.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

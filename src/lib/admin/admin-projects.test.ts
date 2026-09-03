import { describe, expect, it } from "vitest";

import { listAdminProjects } from "./admin-projects";

const rows = [
  {
    buildCheckpoints: [{ id: "cp-1" }],
    buildStatus: "passed",
    builds: [{ artifactRef: "ref", id: "b-1", status: "succeeded" }],
    createdAt: new Date("2026-07-30T10:00:00.000Z"),
    id: "project-new",
    status: "ready",
    thumbnailRef: "project-new.jpg",
    title: "Newest project",
    updatedAt: new Date("2026-07-30T10:30:00.000Z"),
    user: { email: "new@example.com", id: "user-new", name: "New Owner" },
  },
  {
    buildCheckpoints: [],
    buildStatus: "failed",
    builds: [],
    createdAt: new Date("2026-07-29T10:00:00.000Z"),
    id: "project-old",
    status: "failed",
    thumbnailRef: null,
    title: "Old project",
    updatedAt: new Date("2026-07-29T10:30:00.000Z"),
    user: { email: "old@example.com", id: "user-old", name: "Old Owner" },
  },
];

describe("listAdminProjects", () => {
  it("asks Prisma for the 50 newest projects and returns only read-only display fields", async () => {
    const calls: unknown[] = [];
    const client = {
      project: {
        count: async () => 2,
        findMany: async (args: unknown) => {
          calls.push(args);
          return rows;
        },
      },
    };

    const result = await listAdminProjects(client as never, "all");

    expect(calls).toEqual([
      {
        orderBy: { createdAt: "desc" },
        select: {
          buildCheckpoints: { select: { id: true }, take: 1 },
          buildStatus: true,
          builds: {
            orderBy: { createdAt: "desc" },
            select: { artifactRef: true, id: true, status: true },
            take: 5,
          },
          createdAt: true,
          deployments: {
            orderBy: { createdAt: "desc" },
            select: { id: true, kind: true, slug: true, status: true },
            take: 5,
          },
          id: true,
          status: true,
          thumbnailRef: true,
          thumbnailUpdatedAt: true,
          title: true,
          updatedAt: true,
          user: { select: { email: true, id: true, name: true } },
        },
        take: 50,
      },
    ]);
    expect(result.total).toBe(2);
    expect(result.projects[0].accessStatus).toBe("has_preview");
    expect(result.projects[0].latestOperationOutcome).toBe("succeeded");
    expect(result.projects[1].latestOperationOutcome).toBe("failed");
    expect(JSON.stringify(result)).not.toContain("buildLog");
    expect(JSON.stringify(result)).not.toContain("sourceFiles");
    expect(JSON.stringify(result)).not.toContain("prompt");
  });
});

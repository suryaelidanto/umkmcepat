import { describe, expect, it } from "vitest";

import { listAdminProjects } from "./admin-projects";

const rows = [
  {
    buildStatus: "built",
    createdAt: new Date("2026-07-30T10:00:00.000Z"),
    id: "project-new",
    status: "draft",
    thumbnailRef: "project-new.jpg",
    title: "Newest project",
    updatedAt: new Date("2026-07-30T10:30:00.000Z"),
    user: { email: "new@example.com", id: "user-new", name: "New Owner" },
  },
  {
    buildStatus: "failed",
    createdAt: new Date("2026-07-29T10:00:00.000Z"),
    id: "project-old",
    status: "draft",
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
        findMany: async (args: unknown) => {
          calls.push(args);
          return rows;
        },
      },
    };

    const result = await listAdminProjects(client, "all");

    expect(calls).toEqual([
      {
        orderBy: { createdAt: "desc" },
        select: {
          buildStatus: true,
          createdAt: true,
          id: true,
          status: true,
          thumbnailRef: true,
          title: true,
          updatedAt: true,
          user: { select: { email: true, id: true, name: true } },
        },
        take: 50,
      },
    ]);
    expect(result).toEqual({
      projects: [
        {
          buildStatus: "built",
          createdAt: "2026-07-30T10:00:00.000Z",
          id: "project-new",
          owner: {
            email: "new@example.com",
            id: "user-new",
            name: "New Owner",
          },
          status: "draft",
          thumbnailUrl: "/api/projects/project-new/thumbnail",
          title: "Newest project",
          updatedAt: "2026-07-30T10:30:00.000Z",
        },
        {
          buildStatus: "failed",
          createdAt: "2026-07-29T10:00:00.000Z",
          id: "project-old",
          owner: {
            email: "old@example.com",
            id: "user-old",
            name: "Old Owner",
          },
          status: "draft",
          thumbnailUrl: null,
          title: "Old project",
          updatedAt: "2026-07-29T10:30:00.000Z",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("buildLog");
    expect(JSON.stringify(result)).not.toContain("sourceFiles");
    expect(JSON.stringify(result)).not.toContain("prompt");
  });
});

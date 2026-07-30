import { describe, expect, it } from "vitest";

import { loadProjectForViewer } from "./admin-project-observer";

const baseProject = {
  brief: { businessName: "Kopi Ibu", offer: "Kopi susu", version: 1 },
  buildStatus: "ready",
  chatMessages: [
    {
      id: "m1",
      parts: [{ text: "buat website kopi", type: "text" }],
      role: "user",
    },
    { id: "m2", parts: [{ text: "baik", type: "text" }], role: "assistant" },
  ],
  createdAt: new Date("2026-07-30T08:00:00.000Z"),
  id: "project-1",
  prompt: "Buat website kopi",
  status: "ready",
  title: "Website Kopi Ibu",
  updatedAt: new Date("2026-07-30T09:00:00.000Z"),
  user: { email: "owner@example.com", id: "owner-1", name: "Owner" },
  userId: "owner-1",
  workspaceCard: {
    summary: ["Kopi susu"],
    title: "Siap build",
    type: "build_recommendation",
  },
};

function clientReturning(project: typeof baseProject | null) {
  const calls: unknown[] = [];
  return {
    calls,
    project: {
      findUnique: async (args: unknown) => {
        calls.push(args);
        return project;
      },
    },
  };
}

describe("loadProjectForViewer", () => {
  it("returns owner mode for the project owner", async () => {
    const client = clientReturning(baseProject);

    const result = await loadProjectForViewer({
      client,
      projectId: "project-1",
      viewer: { email: "owner@example.com", id: "owner-1" },
    });

    expect(result.mode).toBe("owner");
    expect(result.project?.projectId).toBe("project-1");
  });

  it("returns observer mode for an admin who is not the owner", async () => {
    const client = clientReturning(baseProject);

    const result = await loadProjectForViewer({
      client,
      isAdminEmail: (email) => email === "admin@example.com",
      projectId: "project-1",
      viewer: { email: "admin@example.com", id: "admin-1" },
    });

    expect(result.mode).toBe("observer");
    expect(result.project).toMatchObject({
      buildStatus: "ready",
      createdAt: "2026-07-30T08:00:00.000Z",
      initialPrompt: "Buat website kopi",
      owner: { email: "owner@example.com", id: "owner-1", name: "Owner" },
      projectId: "project-1",
      status: "ready",
      title: "Website Kopi Ibu",
      updatedAt: "2026-07-30T09:00:00.000Z",
    });
    expect(result.project?.initialChatPage.messages).toHaveLength(2);
    expect(JSON.stringify(result.project)).not.toContain("sourceFiles");
    expect(JSON.stringify(result.project)).not.toContain("buildLog");
    expect(JSON.stringify(result.project)).not.toContain("model");
  });

  it("denies a non-admin who is not the owner", async () => {
    const client = clientReturning(baseProject);

    const result = await loadProjectForViewer({
      client,
      isAdminEmail: () => false,
      projectId: "project-1",
      viewer: { email: "other@example.com", id: "other-1" },
    });

    expect(result).toEqual({ mode: "denied", project: null });
  });

  it("selects only read-only observer fields", async () => {
    const client = clientReturning(baseProject);

    await loadProjectForViewer({
      client,
      projectId: "project-1",
      viewer: { email: "owner@example.com", id: "owner-1" },
    });

    expect(client.calls).toEqual([
      {
        select: {
          brief: true,
          buildStatus: true,
          chatMessages: true,
          createdAt: true,
          id: true,
          prompt: true,
          status: true,
          title: true,
          updatedAt: true,
          user: { select: { email: true, id: true, name: true } },
          userId: true,
          workspaceCard: true,
        },
        where: { id: "project-1" },
      },
    ]);
  });
});

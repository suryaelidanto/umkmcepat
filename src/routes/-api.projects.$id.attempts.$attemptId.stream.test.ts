import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const findProject = vi.fn();
const findAttempt = vi.fn();
const findEvents = vi.fn();
const readBuildProgressState = vi.fn();
const createReadStreamFromChannel = vi.fn();

vi.mock("@/lib/auth/auth", () => ({
  auth: () => authMock(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: (...args: unknown[]) => findProject(...args) },
    projectEditAttempt: {
      findFirst: (...args: unknown[]) => findAttempt(...args),
    },
    runtimeEvent: {
      findMany: (...args: unknown[]) => findEvents(...args),
    },
  },
}));

vi.mock("@/lib/projects/build-attempt-pubsub", () => ({
  createReadStreamFromChannel: (...args: unknown[]) =>
    createReadStreamFromChannel(...args),
  encodeSseEvent: (name: string, data: unknown) =>
    `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`,
  readBuildProgressState: (...args: unknown[]) =>
    readBuildProgressState(...args),
}));

import { handleAttemptStreamGet } from "./api.projects.$id.attempts.$attemptId.stream";

describe("handleAttemptStreamGet hydrate", () => {
  beforeEach(() => {
    authMock.mockReset();
    findProject.mockReset();
    findAttempt.mockReset();
    findEvents.mockReset();
    readBuildProgressState.mockReset();
    createReadStreamFromChannel.mockReset();

    authMock.mockResolvedValue({ user: { id: "u1" } });
    findProject.mockResolvedValue({ id: "p1" });
    readBuildProgressState.mockReturnValue("gone");
  });

  it("replays runtimeEvent rows by the attempt's real buildId, not attemptId", async () => {
    findAttempt.mockResolvedValue({
      id: "att_1",
      status: "succeeded",
      buildId: "build_real",
    });
    findEvents.mockResolvedValue([
      {
        message: "Menulis file",
        metadata: {
          label: "Menulis file",
          detail: "src/routes/index.tsx",
          diff: [{ text: "x", type: "add" }],
        },
      },
    ]);

    const res = await handleAttemptStreamGet("p1", "att_1");
    expect(res.status).toBe(200);
    expect(findEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { buildId: "build_real", type: "build.progress" },
      }),
    );
    const body = await res.text();
    expect(body).toContain("Menulis file");
    expect(body).toContain('"type":"done"');
    expect(body).toContain('"diff"');
  });

  it("does not query runtimeEvent with attemptId as buildId", async () => {
    findAttempt.mockResolvedValue({
      id: "att_2",
      status: "failed",
      buildId: "build_xyz",
    });
    findEvents.mockResolvedValue([]);

    await handleAttemptStreamGet("p1", "att_2");
    const arg = findEvents.mock.calls[0]?.[0] as {
      where: { buildId: string };
    };
    expect(arg.where.buildId).toBe("build_xyz");
    expect(arg.where.buildId).not.toBe("att_2");
  });
});

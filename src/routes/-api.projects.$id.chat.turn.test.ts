import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  prismaProjectFindFirstMock,
  prismaProjectChatTurnFindFirstMock,
  getActiveDiscussTurnMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaProjectFindFirstMock: vi.fn(),
  prismaProjectChatTurnFindFirstMock: vi.fn(),
  getActiveDiscussTurnMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: prismaProjectFindFirstMock },
    projectChatTurn: { findFirst: prismaProjectChatTurnFindFirstMock },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));

vi.mock("@/lib/projects/discuss-turn", () => ({
  getActiveDiscussTurn: getActiveDiscussTurnMock,
}));

async function callTurnGet(id = "p_test") {
  const { Route } = await import("./api.projects.$id.chat.turn");
  const handler = (
    Route as unknown as {
      options: {
        server: {
          handlers: {
            GET: (ctx: {
              request: Request;
              params: { id: string };
            }) => Promise<Response>;
          };
        };
      };
    }
  ).options.server.handlers.GET;

  return handler({
    params: { id },
    request: new Request(`http://localhost/api/projects/${id}/chat/turn`),
  });
}

describe("GET /api/projects/$id/chat/turn — active/last turn state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "u_test" } });
    prismaProjectFindFirstMock.mockResolvedValue({ id: "p_test" });
    getActiveDiscussTurnMock.mockResolvedValue(null);
    prismaProjectChatTurnFindFirstMock.mockResolvedValue(null);
  });

  it("401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const response = await callTurnGet();
    expect(response.status).toBe(401);
  });

  it("404 when the project does not belong to the user (no owner leak)", async () => {
    prismaProjectFindFirstMock.mockResolvedValue(null);
    const response = await callTurnGet();
    expect(response.status).toBe(404);
    // Must not probe turn state for another user's project.
    expect(getActiveDiscussTurnMock).not.toHaveBeenCalled();
    expect(prismaProjectChatTurnFindFirstMock).not.toHaveBeenCalled();
  });

  it("200 running turn (active lease) — client tails the stream", async () => {
    getActiveDiscussTurnMock.mockResolvedValue({
      id: "ct_running",
      projectId: "p_test",
      userMessageId: "u1",
      status: "running",
      startedAt: new Date(),
      finishedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      errorMessage: null,
    });

    const response = await callTurnGet();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      turnId: "ct_running",
      status: "running",
      userMessageId: "u1",
    });
    expect("errorMessage" in body).toBe(false);
    // No DB fallback query needed when active turn exists.
    expect(prismaProjectChatTurnFindFirstMock).not.toHaveBeenCalled();
  });

  it("200 succeeded turn (last finished) — client replays the persisted reply", async () => {
    prismaProjectChatTurnFindFirstMock.mockResolvedValue({
      id: "ct_done",
      projectId: "p_test",
      userMessageId: "u1",
      status: "succeeded",
      startedAt: new Date(),
      finishedAt: new Date(),
      expiresAt: new Date(Date.now() - 60_000),
      errorMessage: null,
    });

    const response = await callTurnGet();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      turnId: "ct_done",
      status: "succeeded",
      userMessageId: "u1",
    });
    expect("errorMessage" in body).toBe(false);
    expect(prismaProjectChatTurnFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: "p_test" }),
        orderBy: { startedAt: "desc" },
      }),
    );
  });

  it("200 failed turn — surfaces errorMessage for retry UX", async () => {
    prismaProjectChatTurnFindFirstMock.mockResolvedValue({
      id: "ct_fail",
      projectId: "p_test",
      userMessageId: "u1",
      status: "failed",
      startedAt: new Date(),
      finishedAt: new Date(),
      expiresAt: new Date(Date.now() - 60_000),
      errorMessage: "expired",
    });

    const response = await callTurnGet();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      turnId: "ct_fail",
      status: "failed",
      userMessageId: "u1",
      errorMessage: "expired",
    });
  });

  it("404 when no turn exists for the project at all", async () => {
    const response = await callTurnGet();
    expect(response.status).toBe(404);
  });
});

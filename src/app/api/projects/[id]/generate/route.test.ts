import { afterEach, describe, expect, it, vi } from "vitest";

const { authMock, checkRateLimitMock, prismaProjectFindFirstMock } = vi.hoisted(
  () => ({
    authMock: vi.fn(),
    checkRateLimitMock: vi.fn(async () => null),
    prismaProjectFindFirstMock: vi.fn(),
  }),
);

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: prismaProjectFindFirstMock },
  },
}));

import { POST } from "./route";

describe("project generate route", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("does not load or claim a project when generated builds are disabled", async () => {
    vi.stubEnv("GENERATED_BUILD_EXECUTION_ENABLED", "false");
    authMock.mockResolvedValue({
      expires: new Date().toISOString(),
      user: { id: "user_1" },
    });

    const response = await POST(
      new Request("http://localhost/api/projects/project_1/generate", {
        body: "{}",
        method: "POST",
      }),
      { params: Promise.resolve({ id: "project_1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe("generated_build_execution_unavailable");
    expect(prismaProjectFindFirstMock).not.toHaveBeenCalled();
  });
});

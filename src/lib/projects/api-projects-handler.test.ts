import { describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));

import {
  getIdempotencyKey,
  handleCreateProject,
  handleGetProjects,
} from "./api-projects-handler";

describe("api-projects-handler", () => {
  it("handleGetProjects returns 401 when session user is missing", async () => {
    authMock.mockResolvedValueOnce(null);

    const response = await handleGetProjects(
      new Request("http://localhost/api/projects"),
    );
    expect(response.status).toBe(401);
  });

  it("handleCreateProject returns 401 when session user is missing", async () => {
    authMock.mockResolvedValueOnce(null);

    const response = await handleCreateProject(
      new Request("http://localhost/api/projects", { method: "POST" }),
    );
    expect(response.status).toBe(401);
  });

  it("getIdempotencyKey parses header and validates pattern", () => {
    const validReq = new Request("http://localhost/api/projects", {
      headers: { "Idempotency-Key": "valid-key-123_abc" },
    });
    expect(getIdempotencyKey(validReq)).toBe("valid-key-123_abc");

    const invalidReq = new Request("http://localhost/api/projects", {
      headers: { "Idempotency-Key": "invalid key with spaces!" },
    });
    expect(getIdempotencyKey(invalidReq)).toBe("");
  });
});

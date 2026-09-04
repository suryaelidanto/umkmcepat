import { describe, expect, it, vi } from "vitest";

const { authMock, getSettingMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getSettingMock: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/config/app-settings", () => ({ getSetting: getSettingMock }));

import { handleVisualEditPost } from "./visual-edit-handler";

describe("handleVisualEditPost", () => {
  it("returns 401 when session user is missing", async () => {
    authMock.mockResolvedValueOnce(null);

    const response = await handleVisualEditPost(
      new Request("http://localhost/api/projects/p1/visual-edit", {
        method: "POST",
      }),
      "p1",
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 when visual edit feature is disabled", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "u1" } });
    getSettingMock.mockResolvedValueOnce(false);

    const response = await handleVisualEditPost(
      new Request("http://localhost/api/projects/p1/visual-edit", {
        method: "POST",
      }),
      "p1",
    );

    expect(response.status).toBe(404);
  });
});

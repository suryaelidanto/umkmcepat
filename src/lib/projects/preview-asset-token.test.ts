import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPreviewAssetToken,
  verifyPreviewAssetToken,
} from "@/lib/projects/preview-asset-token";

describe("preview asset token", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows only matching project and deployment asset tokens", () => {
    const token = createPreviewAssetToken({
      deploymentId: "deployment_1",
      projectId: "project_1",
    });

    expect(
      verifyPreviewAssetToken({
        deploymentId: "deployment_1",
        projectId: "project_1",
        token,
      }),
    ).toBe(true);
    expect(
      verifyPreviewAssetToken({
        deploymentId: "deployment_2",
        projectId: "project_1",
        token,
      }),
    ).toBe(false);
    expect(
      verifyPreviewAssetToken({
        deploymentId: "deployment_1",
        projectId: "project_2",
        token,
      }),
    ).toBe(false);
  });

  it("expires capabilities and rejects tampered payloads", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "test-preview-secret");
    vi.stubEnv("PREVIEW_ASSET_TOKEN_TTL_SECONDS", "60");
    const issuedAt = Date.parse("2026-07-10T00:00:00.000Z");
    const token = createPreviewAssetToken({
      deploymentId: "deployment_1",
      now: issuedAt,
      projectId: "project_1",
    });

    expect(
      verifyPreviewAssetToken({
        deploymentId: "deployment_1",
        now: issuedAt + 59_000,
        projectId: "project_1",
        token,
      }),
    ).toBe(true);
    expect(
      verifyPreviewAssetToken({
        deploymentId: "deployment_1",
        now: issuedAt + 61_000,
        projectId: "project_1",
        token,
      }),
    ).toBe(false);
    expect(
      verifyPreviewAssetToken({
        deploymentId: "deployment_1",
        now: issuedAt,
        projectId: "project_1",
        token: token.replace(/.$/, token.endsWith("a") ? "b" : "a"),
      }),
    ).toBe(false);
  });

  it("requires a real signing secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("PREVIEW_ASSET_TOKEN_SECRETS", "");

    expect(() =>
      createPreviewAssetToken({
        deploymentId: "deployment_1",
        projectId: "project_1",
      }),
    ).toThrow("A preview asset signing secret is required in production.");
  });
});

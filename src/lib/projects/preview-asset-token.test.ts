import { afterEach, describe, expect, it, vi } from "vitest";

import {
  invalidateSettingCache,
  primeSettingCache,
} from "@/lib/config/app-settings";
import {
  createPreviewAssetToken,
  verifyPreviewAssetToken,
} from "@/lib/projects/preview-asset-token";

vi.mock("@/lib/prisma", () => {
  const store = new Map<string, unknown>();
  return {
    prisma: {
      appSetting: {
        findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
          store.has(where.key) ? { value: store.get(where.key) } : null,
        ),
        findMany: vi.fn(async () =>
          [...store.entries()].map(([key, value]) => ({ key, value })),
        ),
        upsert: vi.fn(
          async (args: {
            where: { key: string };
            create: { value: unknown };
          }) => {
            store.set(args.where.key, args.create.value);
            return { value: args.create.value };
          },
        ),
        delete: vi.fn(async ({ where }: { where: { key: string } }) => {
          store.delete(where.key);
          return null;
        }),
      },
    },
  };
});

describe("preview asset token", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    invalidateSettingCache();
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

  it("expires capabilities and rejects tampered payloads", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "runtime.preview_token_ttl_seconds" },
      create: {
        key: "runtime.preview_token_ttl_seconds",
        category: "runtime",
        value: 60,
      },
      update: { value: 60 },
    });
    invalidateSettingCache();
    await primeSettingCache();

    vi.stubEnv("NEXTAUTH_SECRET", "test-preview-secret");
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

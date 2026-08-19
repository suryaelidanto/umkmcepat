import { afterEach, describe, expect, it, vi } from "vitest";

import {
  invalidateSettingCache,
  primeSettingCache,
} from "@/lib/config/app-settings";
import {
  assertGeneratedResourceBudget,
  getGeneratedResourceBudget,
  getGeneratedResourceUsage,
} from "@/lib/projects/generated-resource-budget";

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

describe("generated resource budget", () => {
  it("measures UTF-8 bytes and accepts bounded source", () => {
    const files = [
      { content: "halo", path: "src/a.ts" },
      { content: "kopi ☕", path: "src/b.ts" },
    ];

    expect(getGeneratedResourceUsage(files)).toEqual({
      fileCount: 2,
      largestFileBytes: Buffer.byteLength("kopi ☕"),
      totalBytes: Buffer.byteLength("halokopi ☕"),
    });
    expect(() => assertGeneratedResourceBudget(files, "source")).not.toThrow();
  });

  it("rejects per-file, aggregate, and file-count overflow", () => {
    expect(() =>
      assertGeneratedResourceBudget(
        [{ content: "x".repeat(256 * 1024 + 1), path: "src/large.ts" }],
        "source",
      ),
    ).toThrow("Generated source file exceeds 262144 bytes: src/large.ts");

    expect(() =>
      assertGeneratedResourceBudget(
        Array.from({ length: 101 }, (_, index) => ({
          content: "x",
          path: `src/${index}.ts`,
        })),
        "source",
      ),
    ).toThrow("Generated source exceeds 100 files.");
  });
});

describe("resource budgets are DB-first", () => {
  afterEach(() => {
    invalidateSettingCache();
    delete process.env.PROJECT_SOURCE_MAX_FILES;
  });

  it("prefers the DB value over env", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "limits.source.max_files" },
      create: {
        key: "limits.source.max_files",
        category: "limits",
        value: 50,
      },
      update: { value: 50 },
    });
    process.env.PROJECT_SOURCE_MAX_FILES = "200";
    invalidateSettingCache();
    await primeSettingCache();

    expect(getGeneratedResourceBudget("source").maxFiles).toBe(50);
  });

  it("clamps an out-of-range DB value to the policy max", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "limits.source.max_files" },
      create: {
        key: "limits.source.max_files",
        category: "limits",
        value: 999_999,
      },
      update: { value: 999_999 },
    });
    invalidateSettingCache();
    await primeSettingCache();

    expect(getGeneratedResourceBudget("source").maxFiles).toBe(500);
  });
});

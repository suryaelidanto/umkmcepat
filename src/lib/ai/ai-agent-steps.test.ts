import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { getAgentMaxSteps } from "./ai-agent-steps";

import { invalidateSettingCache } from "@/lib/config/app-settings";

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

const ENV_KEYS = [
  "AI_AGENT_GENERATE_MAX_STEPS",
  "AI_AGENT_REPAIR_MAX_STEPS",
  "AI_AGENT_SUBAGENT_MAX_STEPS",
] as const;

function clearEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

beforeEach(clearEnv);
afterEach(clearEnv);

describe("getAgentMaxSteps", () => {
  it("defaults generate to 40 and repair to 12", () => {
    expect(getAgentMaxSteps("generate")).toBe(40);
    expect(getAgentMaxSteps("repair")).toBe(12);
  });

  it("clamps generate steps to [15, 60]", () => {
    process.env.AI_AGENT_GENERATE_MAX_STEPS = "5";
    expect(getAgentMaxSteps("generate")).toBe(15);
    process.env.AI_AGENT_GENERATE_MAX_STEPS = "999";
    expect(getAgentMaxSteps("generate")).toBe(60);
    process.env.AI_AGENT_GENERATE_MAX_STEPS = "40";
    expect(getAgentMaxSteps("generate")).toBe(40);
  });

  it("clamps repair steps to [4, 40]", () => {
    process.env.AI_AGENT_REPAIR_MAX_STEPS = "1";
    expect(getAgentMaxSteps("repair")).toBe(4);
    process.env.AI_AGENT_REPAIR_MAX_STEPS = "100";
    expect(getAgentMaxSteps("repair")).toBe(40);
  });

  it("falls back on invalid values", () => {
    process.env.AI_AGENT_GENERATE_MAX_STEPS = "nope";
    expect(getAgentMaxSteps("generate")).toBe(40);
  });

  it("defaults subagent to 8 and clamps to [2, 15]", () => {
    expect(getAgentMaxSteps("subagent")).toBe(8);
    process.env.AI_AGENT_SUBAGENT_MAX_STEPS = "1";
    expect(getAgentMaxSteps("subagent")).toBe(2);
    process.env.AI_AGENT_SUBAGENT_MAX_STEPS = "100";
    expect(getAgentMaxSteps("subagent")).toBe(15);
    process.env.AI_AGENT_SUBAGENT_MAX_STEPS = "10";
    expect(getAgentMaxSteps("subagent")).toBe(10);
  });
});

describe("getAgentMaxSteps DB-first", () => {
  afterEach(async () => {
    invalidateSettingCache();
    delete process.env.AI_AGENT_GENERATE_MAX_STEPS;
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting
      .delete({
        where: { key: "ai.agent.generate_max_steps" },
      })
      .catch(() => {});
  });

  it("prefers the DB value over env", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "ai.agent.generate_max_steps" },
      create: {
        key: "ai.agent.generate_max_steps",
        category: "ai",
        value: 40,
      },
      update: { value: 40 },
    });
    process.env.AI_AGENT_GENERATE_MAX_STEPS = "50";
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/config/app-settings");
    await primeSettingCache();

    expect(getAgentMaxSteps("generate")).toBe(40);
  });

  it("clamps an out-of-range DB value", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "ai.agent.generate_max_steps" },
      create: {
        key: "ai.agent.generate_max_steps",
        category: "ai",
        value: 999,
      },
      update: { value: 999 },
    });
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/config/app-settings");
    await primeSettingCache();

    expect(getAgentMaxSteps("generate")).toBe(60);
  });

  it("falls back to the default when neither DB nor env is set", () => {
    invalidateSettingCache();
    expect(getAgentMaxSteps("generate")).toBe(40);
  });
});

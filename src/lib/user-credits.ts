import type { Prisma } from "@prisma/client";

import { getSettingSync } from "@/lib/app-settings";
import { devLog } from "@/lib/dev-log";
import { resolveModelPricing } from "@/lib/model-pricing";
import { prisma } from "@/lib/prisma";

/**
 * Cost-based energy system with one-time pilot grant.
 *
 * "Energy" = USD cost × 1,000,000 (micro-USD), computed from the actual
 * provider-qualified model that served each generation (see model-pricing.ts) —
 * not a flat multiplier. This is fair across mixed-provider combos, since each
 * model has a different prompt:completion price ratio.
 *
 * Signup grant: configured per-user at approval time (default 500k ≈ $0.50).
 * No automatic refill; paid booster remains non-expiring.
 */
const DEFAULT_MICRO_USD_PER_ENERGY = 1_000_000;
const DEFAULT_SIGNUP_GRANT = 500_000;
const DEFAULT_MIN_ENERGY_DISCUSS = 5_000;
const DEFAULT_MIN_ENERGY_BUILD = 40_000;
const DEFAULT_MIN_ENERGY_EDIT = 10_000;
const DEFAULT_MIN_ENERGY_MODERATION = 500;

type EnergyPricingProof = Awaited<ReturnType<typeof resolveModelPricing>>;

export const PROJECT_LIMIT_DEFAULT = 5;

// Read as a function, not module-scope constants: the AppSetting snapshot is
// primed per-request in middleware, so a module-evaluation-time read would
// capture the fallback before priming ever runs.
export function getEnergyConfig() {
  return {
    microUsdPerEnergy: getSettingSync(
      "economics.micro_usd_per_energy",
      DEFAULT_MICRO_USD_PER_ENERGY,
    ),
    signupGrant: getSettingSync(
      "economics.signup_energy_grant",
      DEFAULT_SIGNUP_GRANT,
    ),
    minBuild: getSettingSync(
      "economics.min_energy_build",
      DEFAULT_MIN_ENERGY_BUILD,
    ),
    minDiscuss: getSettingSync(
      "economics.min_energy_discuss",
      DEFAULT_MIN_ENERGY_DISCUSS,
    ),
    minEdit: getSettingSync(
      "economics.min_energy_edit",
      DEFAULT_MIN_ENERGY_EDIT,
    ),
    minModeration: getSettingSync(
      "economics.min_energy_moderation",
      DEFAULT_MIN_ENERGY_MODERATION,
    ),
  };
}

export function getProjectLimit(): number {
  const raw = getSettingSync(
    "economics.project_limit",
    Number(process.env.PROJECT_LIMIT) || PROJECT_LIMIT_DEFAULT,
  );
  return Number.isFinite(raw) && raw >= 1
    ? Math.floor(raw)
    : PROJECT_LIMIT_DEFAULT;
}

export async function calculateEnergyCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<number> {
  const input = Math.max(0, Math.floor(inputTokens));
  const output = Math.max(0, Math.floor(outputTokens));
  const pricing = await resolveModelPricing(modelId);
  return calculateEnergyCostFromPricing(pricing, input, output);
}

function calculateEnergyCostFromPricing(
  pricing: Pick<EnergyPricingProof, "promptPrice" | "completionPrice">,
  inputTokens: number,
  outputTokens: number,
): number {
  const usd =
    inputTokens * pricing.promptPrice + outputTokens * pricing.completionPrice;
  return Math.round(usd * getEnergyConfig().microUsdPerEnergy);
}

export async function getRemainingEnergy(userId: string): Promise<number> {
  const stats = await getEnergyStats(userId);
  return stats.remaining;
}

export async function checkEnergy(
  userId: string,
  cost?: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const resolvedCost = cost ?? getEnergyConfig().minDiscuss;
  const remaining = await getRemainingEnergy(userId);
  return { allowed: remaining >= resolvedCost, remaining };
}

/** Deduct energy from the user's non-expiring balance. */
export async function addEnergyUsage(
  userId: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  reason: string,
  options: { projectId?: string | null } = {},
): Promise<{ energyUsed: number; inputTokens: number; outputTokens: number }> {
  const input = Math.max(0, Math.floor(inputTokens));
  const output = Math.max(0, Math.floor(outputTokens));
  const pricing = await resolveModelPricing(modelId.trim() || "unknown");
  const energyUsed = calculateEnergyCostFromPricing(pricing, input, output);

  if (energyUsed <= 0) {
    return { energyUsed: 0, inputTokens: 0, outputTokens: 0 };
  }

  const expiry = new Date("9999-12-31T23:59:59.999Z");
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    await tx.$executeRaw`
      INSERT INTO "UserCredit" ("id", "userId", "projectId", "amount", "inputTokens", "outputTokens", "rawModelId", "pricedModelId", "pricingSource", "promptPrice", "completionPrice", "reason", "expiresAt", "createdAt")
      VALUES (
        ${`c${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`},
        ${userId},
        ${options.projectId ?? null},
        ${-energyUsed},
        ${input},
        ${output},
        ${pricing.rawModelId.slice(0, 160)},
        ${pricing.pricedModelId.slice(0, 160)},
        ${pricing.pricingSource.slice(0, 32)},
        ${pricing.promptPrice},
        ${pricing.completionPrice},
        ${reason.slice(0, 64)},
        ${expiry},
        NOW()
      )
    `;
  });

  logCreditTransaction({
    type: "debit",
    userId,
    amount: -energyUsed,
    reason,
    projectId: options.projectId,
  });

  return { energyUsed, inputTokens: input, outputTokens: output };
}

async function grantEnergy(
  userId: string,
  amount: number,
  reason: "grant:pilot" | "grant:admin",
): Promise<boolean> {
  const expiry = new Date("9999-12-31T23:59:59.999Z");
  const inserted = await prisma.$executeRaw`
    INSERT INTO "UserCredit" ("id", "userId", "amount", "inputTokens", "outputTokens", "reason", "expiresAt", "createdAt")
    VALUES (
      ${`c${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`},
      ${userId},
      ${amount},
      0,
      0,
      ${reason},
      ${expiry},
      NOW()
    )
    ON CONFLICT DO NOTHING
  `;
  return inserted > 0;
}

export async function grantSignupEnergy(userId: string): Promise<boolean> {
  return grantEnergy(userId, getEnergyConfig().signupGrant, "grant:pilot");
}

export async function grantAdminEnergy(
  userId: string,
  amount: number,
): Promise<boolean> {
  return grantEnergy(userId, amount, "grant:admin");
}

/**
 * Route-facing debit after an AI call. Charges on success **or** failure when
 * usage > 0. Never throws into the request path (logs and returns null).
 */
export async function chargeEnergyForAiUsage(opts: {
  userId: string;
  modelId?: string | null;
  inputTokens: number;
  outputTokens: number;
  reason: string;
  projectId?: string | null;
}): Promise<{
  energyUsed: number;
  inputTokens: number;
  outputTokens: number;
} | null> {
  const input = Math.max(0, Math.floor(opts.inputTokens));
  const output = Math.max(0, Math.floor(opts.outputTokens));
  if (input <= 0 && output <= 0) {
    return null;
  }

  try {
    return await addEnergyUsage(
      opts.userId,
      opts.modelId?.trim() || "unknown",
      input,
      output,
      opts.reason,
      { projectId: opts.projectId ?? null },
    );
  } catch (error) {
    console.warn("[energy] chargeEnergyForAiUsage failed", {
      reason: opts.reason,
      userId: opts.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Per-step debit. Same accounting as `chargeEnergyForAiUsage`, but also
 * reports the post-charge balance so agent loops can halt at zero.
 * Never throws into the request path.
 */
export async function chargeEnergyForStep(opts: {
  userId: string;
  modelId?: string | null;
  inputTokens: number;
  outputTokens: number;
  reason: string;
  projectId?: string | null;
}): Promise<{ energyUsed: number; remaining: number } | null> {
  const input = Math.max(0, Math.floor(opts.inputTokens));
  const output = Math.max(0, Math.floor(opts.outputTokens));
  if (input <= 0 && output <= 0) {
    return null;
  }

  try {
    const charged = await addEnergyUsage(
      opts.userId,
      opts.modelId?.trim() || "unknown",
      input,
      output,
      opts.reason,
      { projectId: opts.projectId ?? null },
    );
    const remaining = await getRemainingEnergy(opts.userId);
    return { energyUsed: charged.energyUsed, remaining };
  } catch (error) {
    console.warn("[energy] chargeEnergyForStep failed", {
      reason: opts.reason,
      userId: opts.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function getEnergyStats(userId: string): Promise<{
  remaining: number;
  granted: number;
  used: number;
  inputTokens: number;
  outputTokens: number;
}> {
  const [row] = await prisma.$queryRaw<
    Array<{
      balance: number | null;
      granted: number | null;
      used: number | null;
      inputTokens: number | null;
      outputTokens: number | null;
    }>
  >`
    SELECT
      SUM("amount")::int AS "balance",
      SUM("amount") FILTER (WHERE "amount" > 0)::int AS "granted",
      SUM(ABS("amount")) FILTER (WHERE "amount" < 0)::int AS "used",
      SUM("inputTokens")::int AS "inputTokens",
      SUM("outputTokens")::int AS "outputTokens"
    FROM "UserCredit"
    WHERE "userId" = ${userId}
  `;

  return {
    remaining: Math.max(0, row?.balance ?? 0),
    granted: row?.granted ?? 0,
    used: row?.used ?? 0,
    inputTokens: row?.inputTokens ?? 0,
    outputTokens: row?.outputTokens ?? 0,
  };
}

export async function getProjectCount(userId: string): Promise<number> {
  return prisma.project.count({ where: { userId } });
}

/**
 * True once the user is at the configured ceiling (count >= limit), not just
 * over it. Use this in the UI so the prompt form / banner swap activates
 * the moment the user has as many projects as the limit allows — matching
 * the strict gate in assertUnderProjectLimit.
 */
export function isAtOrOverProjectLimit(count: number, limit: number): boolean {
  return count >= limit;
}

export class ProjectLimitExceededError extends Error {
  readonly code = "project_limit_exceeded" as const;

  constructor(
    readonly count: number,
    readonly limit: number,
  ) {
    super(
      `Project limit exceeded: ${count} >= ${limit}. Delete a project before creating a new one.`,
    );
    this.name = "ProjectLimitExceededError";
  }
}

/**
 * Throws ProjectLimitExceededError if the user already has `limit` or more
 * projects. MUST be called inside a prisma.$transaction (or with an explicit
 * Prisma TransactionClient) so the COUNT(*) and the subsequent INSERT are
 * atomic — otherwise concurrent requests can race past the check.
 */
export async function assertUnderProjectLimit(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  userId: string,
): Promise<{ count: number; limit: number }> {
  const limit = getProjectLimit();
  const [row] = await tx.$queryRaw<Array<{ count: number | bigint | null }>>`
    SELECT COUNT(*)::int AS "count" FROM "Project" WHERE "userId" = ${userId}
  `;
  const count = Number(row?.count ?? 0);

  if (count >= limit) {
    throw new ProjectLimitExceededError(count, limit);
  }

  return { count, limit };
}

/**
 * Helper to log credit transactions (debits and top-ups) to devLog/trace.
 * Standardizes format ensuring userId, amount, reason, and timestamp are present.
 */
export function logCreditTransaction(opts: {
  type: "debit" | "credit";
  userId: string;
  amount: number;
  reason: string;
  projectId?: string | null;
}) {
  devLog("energy", opts.type, {
    userId: opts.userId,
    amount: opts.amount,
    reason: opts.reason,
    timestamp: new Date().toISOString(),
    projectId: opts.projectId ?? null,
  });
}

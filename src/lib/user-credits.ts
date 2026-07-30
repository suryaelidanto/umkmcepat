import type { Prisma } from "@prisma/client";

import { getSettingSync } from "@/lib/app-settings";
import { devLog } from "@/lib/dev-log";
import { resolveModelPricing } from "@/lib/model-pricing";
import { prisma } from "@/lib/prisma";

/**
 * Cost-based energy system.
 *
 * "Energy" = USD cost × 1,000,000 (micro-USD), computed from the actual
 * OpenRouter model that served each generation (see model-pricing.ts) —
 * not a flat multiplier. This is fair across the 7-model combo, since each
 * model has a different prompt:completion price ratio.
 *
 * Daily limit: 250,000 energy ≈ $0.25/day/user (~Rp 4,500/day), the
 * "generous but not wasteful" tier confirmed against real usage.
 * Day boundary: Asia/Jakarta (WIB).
 */
const DEFAULT_MICRO_USD_PER_ENERGY = 1_000_000;
const DEFAULT_DAILY_ENERGY_LIMIT = 250_000;
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
    dailyLimit: getSettingSync(
      "economics.daily_energy_limit",
      DEFAULT_DAILY_ENERGY_LIMIT,
    ),
    microUsdPerEnergy: getSettingSync(
      "economics.micro_usd_per_energy",
      DEFAULT_MICRO_USD_PER_ENERGY,
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

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

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

/** Day boundaries in Asia/Jakarta (WIB, UTC+7). */
export function getDayBoundaries(now: Date = new Date()): {
  startOfDay: Date;
  endOfDay: Date;
} {
  const wibMs = now.getTime() + WIB_OFFSET_MS;
  const wib = new Date(wibMs);
  const startWibUtcMs = Date.UTC(
    wib.getUTCFullYear(),
    wib.getUTCMonth(),
    wib.getUTCDate(),
  );
  const startOfDay = new Date(startWibUtcMs - WIB_OFFSET_MS);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  return { startOfDay, endOfDay };
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

/**
 * Deduct energy based on actual model cost (USD × 1e6).
 * Price comes from OpenRouter via model-pricing cache for `modelId`.
 * Prioritizes daily free energy, then falls back to premium booster credit.
 */
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

  const { startOfDay, endOfDay } = getDayBoundaries();
  const premiumExpiryLimit = new Date("9999-01-01");

  // Serialize per user: the SUM below and the INSERT that follows are a
  // read-modify-write over an aggregate, which a transaction alone does not
  // make safe at READ COMMITTED. The advisory lock is transaction-scoped and
  // releases on commit or rollback.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

    const [freeRow] = await tx.$queryRaw<Array<{ used: number | null }>>`
      SELECT SUM(ABS("amount"))::int AS "used"
      FROM "UserCredit"
      WHERE "userId" = ${userId}
        AND "createdAt" >= ${startOfDay}
        AND "createdAt" < ${endOfDay}
        AND "expiresAt" < ${premiumExpiryLimit}
    `;

    const freeUsedToday = Math.abs(freeRow?.used ?? 0);
    const remainingFree = Math.max(
      0,
      getEnergyConfig().dailyLimit - freeUsedToday,
    );

    let freeDeduction = 0;
    let premiumDeduction = 0;

    if (remainingFree > 0) {
      freeDeduction = Math.min(energyUsed, remainingFree);
      premiumDeduction = energyUsed - freeDeduction;
    } else {
      premiumDeduction = energyUsed;
    }

    const totalDeducted = freeDeduction + premiumDeduction;
    const freeRatio = totalDeducted > 0 ? freeDeduction / totalDeducted : 0;

    if (freeDeduction > 0) {
      await tx.$executeRaw`
        INSERT INTO "UserCredit" ("id", "userId", "projectId", "amount", "inputTokens", "outputTokens", "rawModelId", "pricedModelId", "pricingSource", "promptPrice", "completionPrice", "reason", "expiresAt", "createdAt")
        VALUES (
          ${`c${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`},
          ${userId},
          ${options.projectId ?? null},
          ${-freeDeduction},
          ${Math.round(input * freeRatio)},
          ${Math.round(output * freeRatio)},
          ${pricing.rawModelId.slice(0, 160)},
          ${pricing.pricedModelId.slice(0, 160)},
          ${pricing.pricingSource.slice(0, 32)},
          ${pricing.promptPrice},
          ${pricing.completionPrice},
          ${reason.slice(0, 64)},
          ${endOfDay},
          NOW()
        )
      `;
    }

    if (premiumDeduction > 0) {
      const premiumExpiry = new Date("9999-12-31T23:59:59.999Z");
      await tx.$executeRaw`
        INSERT INTO "UserCredit" ("id", "userId", "projectId", "amount", "inputTokens", "outputTokens", "rawModelId", "pricedModelId", "pricingSource", "promptPrice", "completionPrice", "reason", "expiresAt", "createdAt")
        VALUES (
          ${`c${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`},
          ${userId},
          ${options.projectId ?? null},
          ${-premiumDeduction},
          ${input - Math.round(input * freeRatio)},
          ${output - Math.round(output * freeRatio)},
          ${pricing.rawModelId.slice(0, 160)},
          ${pricing.pricedModelId.slice(0, 160)},
          ${pricing.pricingSource.slice(0, 32)},
          ${pricing.promptPrice},
          ${pricing.completionPrice},
          ${(reason + " (Premium)").slice(0, 64)},
          ${premiumExpiry},
          NOW()
        )
      `;
    }
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
  remainingFree: number;
  remainingPremium: number;
  used: number;
  limit: number;
  resetsAt: Date;
  inputTokens: number;
  outputTokens: number;
}> {
  const { startOfDay, endOfDay } = getDayBoundaries();

  const premiumExpiryLimit = new Date("9999-01-01");

  const [freeRow] = await prisma.$queryRaw<
    Array<{
      amount: number | null;
      inputTokens: number | null;
      outputTokens: number | null;
    }>
  >`
    SELECT
      SUM("amount")::int AS "amount",
      SUM("inputTokens")::int AS "inputTokens",
      SUM("outputTokens")::int AS "outputTokens"
    FROM "UserCredit"
    WHERE "userId" = ${userId}
      AND "createdAt" >= ${startOfDay}
      AND "createdAt" < ${endOfDay}
      AND "expiresAt" < ${premiumExpiryLimit}
  `;

  const [premiumRow] = await prisma.$queryRaw<Array<{ amount: number | null }>>`
    SELECT SUM("amount")::int AS "amount"
    FROM "UserCredit"
    WHERE "userId" = ${userId}
      AND "expiresAt" >= ${premiumExpiryLimit}
  `;

  const freeUsed = Math.abs(freeRow?.amount ?? 0);
  const remainingFree = Math.max(0, getEnergyConfig().dailyLimit - freeUsed);
  const remainingPremium = Math.max(0, premiumRow?.amount ?? 0);
  const remaining = remainingFree + remainingPremium;

  return {
    remaining,
    remainingFree,
    remainingPremium,
    used: freeUsed,
    limit: getEnergyConfig().dailyLimit,
    resetsAt: endOfDay,
    inputTokens: freeRow?.inputTokens ?? 0,
    outputTokens: freeRow?.outputTokens ?? 0,
  };
}

export async function isUserVerified(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { verifiedAt: true },
  });

  return Boolean(user?.verifiedAt);
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

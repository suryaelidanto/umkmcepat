import type { Prisma } from "@prisma/client";

import { getModelPricing } from "@/lib/model-pricing";
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
export const MICRO_USD_PER_ENERGY = 1_000_000;
export const DAILY_ENERGY_LIMIT = 250_000;

/** Soft gate before discuss turns — cheap relative to build. */
export const MIN_ENERGY_DISCUSS = 5_000;
/** Soft gate before full build pipeline. */
export const MIN_ENERGY_BUILD = 40_000;
/** Soft gate before source edit agent. */
export const MIN_ENERGY_EDIT = 10_000;
/** Soft gate before moderation. */
export const MIN_ENERGY_MODERATION = 500;

export const PROJECT_LIMIT_DEFAULT = 5;

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export async function calculateEnergyCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<number> {
  const input = Math.max(0, Math.floor(inputTokens));
  const output = Math.max(0, Math.floor(outputTokens));
  const { promptPrice, completionPrice } = await getModelPricing(modelId);
  const usd = input * promptPrice + output * completionPrice;
  return Math.round(usd * MICRO_USD_PER_ENERGY);
}

export function getProjectLimit(): number {
  const raw = Number(process.env.PROJECT_LIMIT);
  return Number.isFinite(raw) && raw >= 1
    ? Math.floor(raw)
    : PROJECT_LIMIT_DEFAULT;
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
  cost: number = MIN_ENERGY_DISCUSS,
): Promise<{ allowed: boolean; remaining: number }> {
  const remaining = await getRemainingEnergy(userId);
  return { allowed: remaining >= cost, remaining };
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
): Promise<{ energyUsed: number; inputTokens: number; outputTokens: number }> {
  const input = Math.max(0, Math.floor(inputTokens));
  const output = Math.max(0, Math.floor(outputTokens));
  const energyUsed = await calculateEnergyCost(
    modelId.trim() || "unknown",
    input,
    output,
  );

  if (energyUsed <= 0) {
    return { energyUsed: 0, inputTokens: 0, outputTokens: 0 };
  }

  const { startOfDay, endOfDay } = getDayBoundaries();
  const premiumExpiryLimit = new Date("9999-01-01");

  // Transaction ensures we safely read and deduct without race conditions.
  await prisma.$transaction(async (tx) => {
    const [freeRow] = await tx.$queryRaw<Array<{ used: number | null }>>`
      SELECT SUM(ABS("amount"))::int AS "used"
      FROM "UserCredit"
      WHERE "userId" = ${userId}
        AND "createdAt" >= ${startOfDay}
        AND "createdAt" < ${endOfDay}
        AND "expiresAt" < ${premiumExpiryLimit}
    `;

    const freeUsedToday = Math.abs(freeRow?.used ?? 0);
    const remainingFree = Math.max(0, DAILY_ENERGY_LIMIT - freeUsedToday);

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
        INSERT INTO "UserCredit" ("id", "userId", "amount", "inputTokens", "outputTokens", "reason", "expiresAt", "createdAt")
        VALUES (
          ${`c${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`},
          ${userId},
          ${-freeDeduction},
          ${Math.round(input * freeRatio)},
          ${Math.round(output * freeRatio)},
          ${reason.slice(0, 64)},
          ${endOfDay},
          NOW()
        )
      `;
    }

    if (premiumDeduction > 0) {
      const premiumExpiry = new Date("9999-12-31T23:59:59.999Z");
      await tx.$executeRaw`
        INSERT INTO "UserCredit" ("id", "userId", "amount", "inputTokens", "outputTokens", "reason", "expiresAt", "createdAt")
        VALUES (
          ${`c${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`},
          ${userId},
          ${-premiumDeduction},
          ${input - Math.round(input * freeRatio)},
          ${output - Math.round(output * freeRatio)},
          ${(reason + " (Premium)").slice(0, 64)},
          ${premiumExpiry},
          NOW()
        )
      `;
    }
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

  // Sum free usage today.
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

  // Sum premium balance (can cross day boundaries).
  const [premiumRow] = await prisma.$queryRaw<Array<{ amount: number | null }>>`
    SELECT SUM("amount")::int AS "amount"
    FROM "UserCredit"
    WHERE "userId" = ${userId}
      AND "expiresAt" >= ${premiumExpiryLimit}
  `;

  const freeUsed = Math.abs(freeRow?.amount ?? 0);
  const remainingFree = Math.max(0, DAILY_ENERGY_LIMIT - freeUsed);
  const remainingPremium = Math.max(0, premiumRow?.amount ?? 0);
  const remaining = remainingFree + remainingPremium;

  return {
    remaining,
    remainingFree,
    remainingPremium,
    used: freeUsed,
    limit: DAILY_ENERGY_LIMIT,
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

export function isOverProjectLimit(count: number, limit: number): boolean {
  return count > limit;
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

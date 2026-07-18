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
 * Daily limit: 230,000 energy ≈ $0.23/day/user (~Rp 3,700/day), the
 * "generous but not wasteful" tier confirmed against real usage.
 * Day boundary: Asia/Jakarta (WIB).
 */
export const MICRO_USD_PER_ENERGY = 1_000_000;
export const DAILY_ENERGY_LIMIT = 230_000;

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

// Dev-only manual override, toggled via the navbar "Unlimited mode" button.
// Off by default so dev energy depletes like production and nobody forgets
// to turn a blanket bypass off.
let devUnlimitedEnergyEnabled = false;

export function isDevUnlimitedEnergyEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && devUnlimitedEnergyEnabled;
}

export function setDevUnlimitedEnergy(enabled: boolean): void {
  if (process.env.NODE_ENV !== "production") {
    devUnlimitedEnergyEnabled = enabled;
  }
}

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
  if (isDevUnlimitedEnergyEnabled()) {
    return DAILY_ENERGY_LIMIT;
  }
  const stats = await getEnergyStats(userId);
  return stats.remaining;
}

export async function checkEnergy(
  userId: string,
  cost: number = MIN_ENERGY_DISCUSS,
): Promise<{ allowed: boolean; remaining: number }> {
  if (isDevUnlimitedEnergyEnabled()) {
    return { allowed: true, remaining: DAILY_ENERGY_LIMIT };
  }
  const remaining = await getRemainingEnergy(userId);
  return { allowed: remaining >= cost, remaining };
}

/**
 * Deduct energy based on actual model cost (USD × 1e6).
 * Price comes from OpenRouter via model-pricing cache for `modelId`.
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
  // ponytail: reasoning/cache token breakdown not split; relies on provider
  // folding billed tokens into input/output. Split when 9router exposes stable fields.
  const energyUsed = await calculateEnergyCost(
    modelId.trim() || "unknown",
    input,
    output,
  );

  if (energyUsed <= 0) {
    return { energyUsed: 0, inputTokens: 0, outputTokens: 0 };
  }

  if (isDevUnlimitedEnergyEnabled()) {
    return { energyUsed, inputTokens: input, outputTokens: output };
  }

  const { endOfDay } = getDayBoundaries();
  // Raw insert: Prisma client can lag schema when dev server locks generate.
  await prisma.$executeRaw`
    INSERT INTO "UserCredit" ("id", "userId", "amount", "inputTokens", "outputTokens", "reason", "expiresAt", "createdAt")
    VALUES (
      ${`c${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`},
      ${userId},
      ${-energyUsed},
      ${input},
      ${output},
      ${reason.slice(0, 64)},
      ${endOfDay},
      NOW()
    )
  `;

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
  used: number;
  limit: number;
  resetsAt: Date;
  inputTokens: number;
  outputTokens: number;
}> {
  const { startOfDay, endOfDay } = getDayBoundaries();

  if (isDevUnlimitedEnergyEnabled()) {
    return {
      remaining: DAILY_ENERGY_LIMIT,
      used: 0,
      limit: DAILY_ENERGY_LIMIT,
      resetsAt: endOfDay,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const [row] = await prisma.$queryRaw<
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
  `;

  const used = Math.abs(row?.amount ?? 0);
  const remaining = Math.max(0, DAILY_ENERGY_LIMIT - used);

  return {
    remaining,
    used,
    limit: DAILY_ENERGY_LIMIT,
    resetsAt: endOfDay,
    inputTokens: row?.inputTokens ?? 0,
    outputTokens: row?.outputTokens ?? 0,
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

import { prisma } from "@/lib/prisma";

/**
 * Token-based energy system.
 *
 * Formula: energy = inputTokens + (2 × outputTokens)
 *
 * Output tokens cost ~2× more than input tokens (DeepSeek V4 Pro pricing).
 * Daily limit: 200,000 energy ≈ Rp 1,400/day/user at current pricing.
 * Day boundary: Asia/Jakarta (WIB).
 */
export const DAILY_ENERGY_LIMIT = 200_000;

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

export function calculateEnergy(inputTokens: number, outputTokens: number) {
  const input = Math.max(0, Math.floor(inputTokens));
  const output = Math.max(0, Math.floor(outputTokens));
  return input + 2 * output;
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
 * Deduct energy based on actual token usage.
 * Formula: energy = inputTokens + (2 × outputTokens)
 */
export async function addEnergyUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
  reason: string,
): Promise<{ energyUsed: number; inputTokens: number; outputTokens: number }> {
  const input = Math.max(0, Math.floor(inputTokens));
  const output = Math.max(0, Math.floor(outputTokens));
  const energyUsed = calculateEnergy(input, output);

  if (energyUsed <= 0) {
    return { energyUsed: 0, inputTokens: 0, outputTokens: 0 };
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

export async function getEnergyStats(userId: string): Promise<{
  remaining: number;
  used: number;
  limit: number;
  resetsAt: Date;
  inputTokens: number;
  outputTokens: number;
}> {
  const { startOfDay, endOfDay } = getDayBoundaries();

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

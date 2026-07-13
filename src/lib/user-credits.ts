import { prisma } from "@/lib/prisma";

export const DAILY_ENERGY_LIMIT = 50;
export const ENERGY_COST_DISCUSS = 5;
export const ENERGY_COST_BUILD = 20;
export const PROJECT_LIMIT_DEFAULT = 5;

export const AI_MAX_TOKENS_DISCUSS = 2048;
export const AI_MAX_TOKENS_DISCUSS_CARD = 1024;
export const AI_MAX_TOKENS_BUILD_SPEC = 8192;
export const AI_MAX_TOKENS_EDIT = 16384;
export const AI_MAX_TOKENS_SOURCE_GENERATION = 32768;

export function getProjectLimit(): number {
  const raw = Number(process.env.PROJECT_LIMIT);
  return Number.isFinite(raw) && raw >= 1
    ? Math.floor(raw)
    : PROJECT_LIMIT_DEFAULT;
}

export function getDayBoundaries(now: Date = new Date()): {
  startOfDay: Date;
  endOfDay: Date;
} {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  return { startOfDay, endOfDay };
}

export async function getRemainingEnergy(userId: string): Promise<number> {
  const { startOfDay, endOfDay } = getDayBoundaries();

  const result = await prisma.userCredit.aggregate({
    where: {
      userId,
      createdAt: { gte: startOfDay, lt: endOfDay },
    },
    _sum: { amount: true },
  });

  const used = Math.abs(result._sum.amount ?? 0);
  return Math.max(0, DAILY_ENERGY_LIMIT - used);
}

export async function checkEnergy(
  userId: string,
  cost: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const remaining = await getRemainingEnergy(userId);
  return { allowed: remaining >= cost, remaining };
}

export async function deductEnergy(
  userId: string,
  cost: number,
  reason: string,
): Promise<void> {
  const { endOfDay } = getDayBoundaries();

  await prisma.userCredit.create({
    data: {
      userId,
      amount: -cost,
      reason,
      expiresAt: endOfDay,
    },
  });
}

export async function getEnergyStats(userId: string): Promise<{
  remaining: number;
  used: number;
  limit: number;
  resetsAt: Date;
}> {
  const { startOfDay, endOfDay } = getDayBoundaries();

  const result = await prisma.userCredit.aggregate({
    where: {
      userId,
      createdAt: { gte: startOfDay, lt: endOfDay },
    },
    _sum: { amount: true },
  });

  const used = Math.abs(result._sum.amount ?? 0);
  const remaining = Math.max(0, DAILY_ENERGY_LIMIT - used);

  return {
    remaining,
    used,
    limit: DAILY_ENERGY_LIMIT,
    resetsAt: endOfDay,
  };
}

export async function isUserVerified(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { verifiedAt: true },
  });
  return user?.verifiedAt !== null && user?.verifiedAt !== undefined;
}

export async function getProjectCount(userId: string): Promise<number> {
  return prisma.project.count({ where: { userId } });
}

export function isOverProjectLimit(count: number, limit: number): boolean {
  return count > limit;
}

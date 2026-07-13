import { prisma } from "@/lib/prisma";

export const DAILY_ENERGY_LIMIT = 50;
export const ENERGY_COST_DISCUSS = 5;
export const ENERGY_COST_BUILD = 20;

export async function getRemainingEnergy(userId: string): Promise<number> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const result = await prisma.userCredit.aggregate({
    where: {
      userId,
      expiresAt: { gte: startOfDay, lt: endOfDay },
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
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

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
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const result = await prisma.userCredit.aggregate({
    where: {
      userId,
      expiresAt: { gte: startOfDay, lt: endOfDay },
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

import { PrismaClient } from "@prisma/client";

declare global {
  // allow global `var` declarations

  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    // Optional: Log Prisma queries in development
    // log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : [],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

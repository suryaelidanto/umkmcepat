import { prisma } from "../src/lib/prisma";

type BackfillCandidate = {
  currentBalance: number;
  paidEnergy: number;
  spentEnergy: number;
  userId: string;
};

const PILOT_GRANT = 500_000;
const DRY_RUN = !process.argv.includes("--apply");

export function calculateBackfillAmount(candidate: BackfillCandidate): number {
  const paidRemainder = Math.max(
    0,
    candidate.paidEnergy - candidate.spentEnergy,
  );
  return PILOT_GRANT + paidRemainder - candidate.currentBalance;
}

async function main() {
  const candidates = await prisma.$queryRaw<BackfillCandidate[]>`
    WITH eligible_users AS (
      SELECT DISTINCT u."id" AS "userId"
      FROM "WaitlistEntry" w
      JOIN "User" u ON LOWER(TRIM(u."email")) = LOWER(TRIM(w."email"))
      WHERE w."status" = 'approved'
    ),
    completed_payments AS (
      SELECT
        p."userId",
        COALESCE(SUM(p."energyGranted"), 0)::int AS "paidEnergy"
      FROM "Payment" p
      WHERE p."status" = 'COMPLETED'
      GROUP BY p."userId"
    ),
    ledger AS (
      SELECT
        uc."userId",
        COALESCE(SUM(uc."amount"), 0)::int AS "currentBalance",
        COALESCE(SUM(ABS(uc."amount")) FILTER (WHERE uc."amount" < 0), 0)::int AS "spentEnergy"
      FROM "UserCredit" uc
      GROUP BY uc."userId"
    )
    SELECT
      eu."userId",
      COALESCE(l."currentBalance", 0) AS "currentBalance",
      COALESCE(l."spentEnergy", 0) AS "spentEnergy",
      COALESCE(cp."paidEnergy", 0) AS "paidEnergy"
    FROM eligible_users eu
    LEFT JOIN ledger l ON l."userId" = eu."userId"
    LEFT JOIN completed_payments cp ON cp."userId" = eu."userId"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "UserCredit" uc
      WHERE uc."userId" = eu."userId"
        AND uc."reason" IN ('grant:pilot', 'grant:pilot-backfill')
    )
  `;

  let inserted = 0;
  let netAdjustment = 0;
  for (const candidate of candidates) {
    const amount = calculateBackfillAmount(candidate);
    netAdjustment += amount;
    if (!DRY_RUN && amount !== 0) {
      const result = await prisma.$executeRaw`
        INSERT INTO "UserCredit" ("id", "userId", "amount", "inputTokens", "outputTokens", "reason", "expiresAt", "createdAt")
        VALUES (
          ${`c${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`},
          ${candidate.userId},
          ${amount},
          0,
          0,
          'grant:pilot-backfill',
          ${new Date("9999-12-31T23:59:59.999Z")},
          NOW()
        )
        ON CONFLICT DO NOTHING
      `;
      inserted += result > 0 ? 1 : 0;
    }
  }

  const mode = DRY_RUN ? "[dry-run]" : "[apply]";
  console.warn(`${mode} eligible users: ${candidates.length}`);
  console.warn(`${mode} net energy adjustment: ${netAdjustment}`);
  if (!DRY_RUN) {
    console.warn(`${mode} rows inserted: ${inserted}`);
  }
}

if (process.argv[1]?.endsWith("backfill-energy-grant.ts")) {
  main()
    .catch((error) => {
      console.error("backfill failed:", error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

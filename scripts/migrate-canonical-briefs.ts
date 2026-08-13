import { Prisma } from "@prisma/client";

import { prisma } from "../src/lib/prisma";
import { canonicalJson } from "../src/lib/projects/build-hash";
import { evaluateBuildReadiness } from "../src/lib/projects/build-readiness";
import {
  parseCanonicalBrief,
  type ProjectBriefV2,
} from "../src/lib/projects/canonical-brief";

const BATCH_SIZE = 100;

type MigrationHandoff = {
  id: string;
  status: string;
};

export type CanonicalBriefMigrationRow = {
  activeHandoffId: string | null;
  brief: unknown;
  handoffs: MigrationHandoff[];
  id: string;
  prompt: string;
  workspaceCard: unknown;
};

export type CanonicalBriefMigrationPlan = {
  activeHandoffId: string | null;
  blockers: string[];
  brief: ProjectBriefV2;
  pendingWrite: boolean;
  supersedeDraftHandoffIds: string[];
  workspaceCard: unknown;
};

export function planCanonicalBriefMigration(
  row: CanonicalBriefMigrationRow,
): CanonicalBriefMigrationPlan {
  const brief = parseCanonicalBrief(row.brief, row.prompt);
  const readiness = evaluateBuildReadiness(brief);
  const blockers =
    readiness.state === "blocked"
      ? readiness.blockers.map((blocker) => blocker.field)
      : [];
  const supersedeDraftHandoffIds = row.handoffs
    .filter((handoff) => handoff.status === "draft")
    .map((handoff) => handoff.id);
  const hasAcceptedActiveHandoff = row.handoffs.some(
    (handoff) =>
      handoff.id === row.activeHandoffId && handoff.status === "accepted",
  );
  const workspaceCard = hasAcceptedActiveHandoff
    ? row.workspaceCard
    : clearStaleBuildCard(row.workspaceCard);
  const pendingWrite =
    !isCanonicalBrief(row.brief) ||
    canonicalJson(row.brief) !== canonicalJson(brief) ||
    workspaceCard !== row.workspaceCard ||
    supersedeDraftHandoffIds.length > 0;

  return {
    activeHandoffId: row.activeHandoffId,
    blockers,
    brief,
    pendingWrite,
    supersedeDraftHandoffIds,
    workspaceCard,
  };
}

function isCanonicalBrief(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { version?: unknown }).version === 2
  );
}

function clearStaleBuildCard(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === "build_recommendation"
  ) {
    return null;
  }
  return value;
}

async function applyPlans(
  rows: CanonicalBriefMigrationRow[],
  plans: CanonicalBriefMigrationPlan[],
): Promise<number> {
  const pending = plans
    .map((plan, index) => ({ plan, row: rows[index] }))
    .filter(
      (
        entry,
      ): entry is {
        plan: CanonicalBriefMigrationPlan;
        row: CanonicalBriefMigrationRow;
      } => Boolean(entry.row) && entry.plan.pendingWrite,
    );
  if (pending.length === 0) {
    return 0;
  }

  await prisma.$transaction(async (tx) => {
    for (const { plan, row } of pending) {
      await tx.project.update({
        where: { id: row.id },
        data: {
          brief: plan.brief as unknown as Prisma.InputJsonValue,
          workspaceCard:
            plan.workspaceCard === null
              ? Prisma.JsonNull
              : (plan.workspaceCard as Prisma.InputJsonValue),
        },
      });
      if (plan.supersedeDraftHandoffIds.length > 0) {
        await tx.projectBuildHandoff.updateMany({
          where: {
            id: { in: plan.supersedeDraftHandoffIds },
            status: "draft",
          },
          data: { status: "superseded", supersededAt: new Date() },
        });
      }
    }
  });
  return pending.length;
}

async function main() {
  const apply = process.argv.includes("--apply");
  let cursor: string | undefined;
  let scanned = 0;
  let pendingWrites = 0;
  let written = 0;
  const blockerCounts = new Map<string, number>();

  for (;;) {
    const rows = await prisma.project.findMany({
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        activeHandoffId: true,
        brief: true,
        buildHandoffs: { select: { id: true, status: true } },
        id: true,
        prompt: true,
        workspaceCard: true,
      },
    });
    if (rows.length === 0) {
      break;
    }
    const migrationRows = rows.map((row) => ({
      activeHandoffId: row.activeHandoffId,
      brief: row.brief,
      handoffs: row.buildHandoffs,
      id: row.id,
      prompt: row.prompt,
      workspaceCard: row.workspaceCard,
    }));
    const plans = migrationRows.map(planCanonicalBriefMigration);
    scanned += plans.length;
    pendingWrites += plans.filter((plan) => plan.pendingWrite).length;
    for (const blocker of plans.flatMap((plan) => plan.blockers)) {
      blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1);
    }
    if (apply) {
      written += await applyPlans(migrationRows, plans);
    }
    cursor = rows.at(-1)?.id;
  }

  const mode = apply ? "apply" : "preview";
  console.warn(`[${mode}] projects scanned: ${scanned}`);
  console.warn(`[${mode}] pending writes: ${pendingWrites}`);
  console.warn(`[${mode}] rows written: ${written}`);
  console.warn(
    `[${mode}] blocker fields: ${JSON.stringify(Object.fromEntries([...blockerCounts.entries()].sort()))}`,
  );
}

if (import.meta.main) {
  main()
    .catch((error: unknown) => {
      console.error(
        "canonical brief migration failed",
        error instanceof Error ? error.message : "unknown error",
      );
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

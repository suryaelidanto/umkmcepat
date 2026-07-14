import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  DEFAULT_PREVIEW_IDLE_TIMEOUT_MS,
  shouldStopIdleDeployment,
} from "@/lib/projects/runtime-policy";
import {
  getRuntimeSupervisor,
  type RuntimeSupervisor,
} from "@/lib/projects/runtime-supervisor";

type IdleDeploymentRecord = {
  id: string;
  lastRequestAt: Date | null;
  status: string;
};

type RuntimeIdlePrisma = {
  projectDeployment: {
    findMany(input: unknown): Promise<IdleDeploymentRecord[]>;
  };
};

type StopIdleDeploymentsOptions = {
  idleTimeoutMs?: number;
  limit?: number;
  now?: Date;
  prisma?: RuntimeIdlePrisma;
  supervisor?: RuntimeSupervisor;
};

export async function stopIdleProjectDeployments(
  options: StopIdleDeploymentsOptions = {},
) {
  const runtimePrisma =
    options.prisma ?? (defaultPrisma as unknown as RuntimeIdlePrisma);
  const supervisor = options.supervisor ?? getRuntimeSupervisor();
  const now = options.now ?? new Date();
  const candidates = await runtimePrisma.projectDeployment.findMany({
    orderBy: { lastRequestAt: "asc" },
    select: {
      id: true,
      lastRequestAt: true,
      status: true,
    },
    take: options.limit ?? 50,
    where: {
      kind: "preview",
      lastRequestAt: { not: null },
      status: "running",
    },
  });
  const stopped: string[] = [];

  for (const deployment of candidates) {
    if (
      !shouldStopIdleDeployment(
        deployment,
        now,
        options.idleTimeoutMs ?? DEFAULT_PREVIEW_IDLE_TIMEOUT_MS,
      )
    ) {
      continue;
    }

    const status = await supervisor.stopDeployment(deployment.id);

    if (status === "stopped") {
      stopped.push(deployment.id);
    }
  }

  return {
    checked: candidates.length,
    stopped,
  };
}

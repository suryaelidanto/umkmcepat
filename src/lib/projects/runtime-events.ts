import type { Prisma } from "@prisma/client";

import { type RuntimeEventType } from "@/lib/projects/runtime-types";

export type RuntimeEventInput = {
  buildId?: string | null;
  deploymentId?: string | null;
  message?: string;
  metadata?: Prisma.InputJsonValue;
  projectId?: string | null;
  runtimeNodeId?: string | null;
  type: RuntimeEventType;
};

export function createRuntimeEventData(input: RuntimeEventInput) {
  return {
    buildId: input.buildId || undefined,
    deploymentId: input.deploymentId || undefined,
    message: input.message,
    metadata: input.metadata,
    projectId: input.projectId || undefined,
    runtimeNodeId: input.runtimeNodeId || undefined,
    type: input.type,
  };
}

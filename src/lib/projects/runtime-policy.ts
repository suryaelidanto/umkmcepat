import {
  type ProjectDeploymentStatus,
  type RuntimeNodeStatus,
} from "@/lib/projects/runtime-types";

export const DEFAULT_PREVIEW_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export type RuntimeResourceLimits = {
  cpuCores: number;
  memoryMb: number;
};

export const DEFAULT_RUNTIME_RESOURCE_LIMITS = {
  cpuCores: 0.5,
  memoryMb: 512,
} satisfies RuntimeResourceLimits;

export type DeploymentIdleInput = {
  lastRequestAt?: Date | string | number | null;
  status: ProjectDeploymentStatus | string;
};

export type RuntimeNodeCandidate = {
  id: string;
  maxContainers: number;
  status: RuntimeNodeStatus | string;
  usedContainers: number;
};

export function shouldStopIdleDeployment(
  deployment: DeploymentIdleInput,
  now: Date,
  idleTimeoutMs = DEFAULT_PREVIEW_IDLE_TIMEOUT_MS,
) {
  if (deployment.status !== "running" || !deployment.lastRequestAt) {
    return false;
  }

  const lastRequestAt = new Date(deployment.lastRequestAt).getTime();

  if (!Number.isFinite(lastRequestAt)) {
    return false;
  }

  return now.getTime() - lastRequestAt >= idleTimeoutMs;
}

export function nodeHasCapacity(node: RuntimeNodeCandidate) {
  return (
    node.status === "active" &&
    node.maxContainers > 0 &&
    node.usedContainers >= 0 &&
    node.usedContainers < node.maxContainers
  );
}

export function chooseRuntimeNode(
  nodes: RuntimeNodeCandidate[],
): RuntimeNodeCandidate | null {
  const candidates = nodes.filter(nodeHasCapacity);

  if (!candidates.length) {
    return null;
  }

  return candidates.reduce((best, node) =>
    node.usedContainers < best.usedContainers ? node : best,
  );
}

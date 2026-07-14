export const PROJECT_SNAPSHOT_SOURCE_TYPES = [
  "generated",
  "imported",
  "manual",
] as const;

export type ProjectSnapshotSourceType =
  (typeof PROJECT_SNAPSHOT_SOURCE_TYPES)[number];

export const PROJECT_BUILD_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
] as const;

export type ProjectBuildStatus = (typeof PROJECT_BUILD_STATUSES)[number];

export const PROJECT_DEPLOYMENT_STATUSES = [
  "created",
  "starting",
  "running",
  "stopped",
  "failed",
] as const;

export type ProjectDeploymentStatus =
  (typeof PROJECT_DEPLOYMENT_STATUSES)[number];

export const PROJECT_DEPLOYMENT_KINDS = ["preview", "published"] as const;

export type ProjectDeploymentKind = (typeof PROJECT_DEPLOYMENT_KINDS)[number];

export const RUNTIME_NODE_STATUSES = ["active", "draining", "offline"] as const;

export type RuntimeNodeStatus = (typeof RUNTIME_NODE_STATUSES)[number];

export const RUNTIME_EVENT_TYPES = [
  "snapshot.created",
  "build.started",
  "build.succeeded",
  "build.failed",
  "build.canceled",
  "deployment.created",
  "deployment.started",
  "deployment.stopped",
  "deployment.failed",
] as const;

export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[number];

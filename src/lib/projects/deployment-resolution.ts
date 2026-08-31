import { isProjectArtifactRefFor } from "@/lib/projects/runtime-artifacts";

export type ResolvableProjectSnapshot = {
  id: string;
  projectId?: string | null;
};

export type ResolvableProjectBuild = {
  artifactRef?: string | null;
  createdAt?: Date | number | string | null;
  id: string;
  projectId?: string | null;
  snapshot?: ResolvableProjectSnapshot | null;
  snapshotId?: string | null;
  status?: string | null;
  updatedAt?: Date | number | string | null;
};

export type ResolvableProjectDeployment<
  TBuild extends ResolvableProjectBuild = ResolvableProjectBuild,
> = {
  build?: TBuild | null;
  buildId?: string | null;
  createdAt?: Date | number | string | null;
  id: string;
  kind?: string | null;
  projectId?: string | null;
  snapshot?: ResolvableProjectSnapshot | null;
  snapshotId?: string | null;
  status?: string | null;
  updatedAt?: Date | number | string | null;
};

const FAILED_ATTEMPT_STATUSES = new Set(["canceled", "failed", "stale"]);

export function isSuccessfulBuildWithArtifact(
  build: ResolvableProjectBuild | null | undefined,
) {
  return (
    build?.status === "succeeded" &&
    isProjectArtifactRefFor(build.artifactRef, "dist", build.id)
  );
}

export function isProjectBuildForProject(
  build: ResolvableProjectBuild | null | undefined,
  projectId: string,
) {
  return Boolean(
    build &&
    build.projectId === projectId &&
    build.snapshot?.id === build.snapshotId &&
    build.snapshot?.projectId === projectId,
  );
}

export function isProjectDeploymentForProject(
  deployment: ResolvableProjectDeployment | null | undefined,
  projectId: string,
) {
  const build = deployment?.build;
  return Boolean(
    deployment &&
    deployment.projectId === projectId &&
    deployment.buildId === build?.id &&
    deployment.snapshot?.id === deployment.snapshotId &&
    deployment.snapshot?.projectId === projectId &&
    deployment.snapshotId === build?.snapshotId &&
    isProjectBuildForProject(build, projectId),
  );
}

export function selectLatestAttempt<TBuild extends ResolvableProjectBuild>(
  builds: TBuild[],
) {
  return sortNewestFirst(builds)[0] ?? null;
}

export function selectLatestFailedAttempt<
  TBuild extends ResolvableProjectBuild,
>(builds: TBuild[]) {
  return (
    sortNewestFirst(builds).find((build) =>
      FAILED_ATTEMPT_STATUSES.has(build.status ?? ""),
    ) ?? null
  );
}

export function selectLatestSuccessfulBuild<
  TBuild extends ResolvableProjectBuild,
>(builds: TBuild[]) {
  return sortNewestFirst(builds).find(isSuccessfulBuildWithArtifact) ?? null;
}

export function selectActivePreviewDeployment<
  TDeployment extends ResolvableProjectDeployment,
>(deployments: TDeployment[]) {
  return (
    sortNewestFirst(deployments).find(
      (deployment) =>
        deployment.kind === "preview" &&
        hasConsistentDeploymentPointers(deployment) &&
        isSuccessfulBuildWithArtifact(deployment.build),
    ) ?? null
  );
}

export function selectActivePublishedDeployment<
  TDeployment extends ResolvableProjectDeployment,
>(deployments: TDeployment[]) {
  return (
    [...deployments]
      .filter(
        (deployment) =>
          deployment.kind === "published" &&
          hasConsistentDeploymentPointers(deployment) &&
          isSuccessfulBuildWithArtifact(deployment.build),
      )
      .sort(compareNewestDeploymentUpdate)[0] ?? null
  );
}

function hasConsistentDeploymentPointers(
  deployment: ResolvableProjectDeployment,
) {
  return (
    deployment.buildId === deployment.build?.id &&
    deployment.snapshotId === deployment.build?.snapshotId
  );
}

function sortNewestFirst<
  TItem extends { createdAt?: Date | number | string | null },
>(items: TItem[]) {
  return [...items].sort((left, right) => {
    return getTimeValue(right.createdAt) - getTimeValue(left.createdAt);
  });
}

function compareNewestDeploymentUpdate<
  TDeployment extends {
    createdAt?: Date | number | string | null;
    updatedAt?: Date | number | string | null;
  },
>(left: TDeployment, right: TDeployment) {
  const byUpdatedAt =
    getTimeValue(right.updatedAt) - getTimeValue(left.updatedAt);

  if (byUpdatedAt !== 0) {
    return byUpdatedAt;
  }

  return getTimeValue(right.createdAt) - getTimeValue(left.createdAt);
}

function getTimeValue(value: Date | number | string | null | undefined) {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  return 0;
}

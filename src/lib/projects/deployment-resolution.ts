export type ResolvableProjectBuild = {
  artifactRef?: string | null;
  createdAt?: Date | number | string | null;
  id: string;
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
  snapshotId?: string | null;
  status?: string | null;
  updatedAt?: Date | number | string | null;
};

const FAILED_ATTEMPT_STATUSES = new Set(["canceled", "failed", "stale"]);

export function isSuccessfulBuildWithArtifact(
  build: ResolvableProjectBuild | null | undefined,
) {
  return build?.status === "succeeded" && hasArtifactRef(build.artifactRef);
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
          isSuccessfulBuildWithArtifact(deployment.build),
      )
      .sort(compareNewestDeploymentUpdate)[0] ?? null
  );
}

function hasArtifactRef(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
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

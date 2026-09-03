import { describe, expect, it } from "vitest";

import {
  isProjectBuildForProject,
  isProjectDeploymentForProject,
  selectActivePreviewDeployment,
  selectActivePublishedDeployment,
  selectLatestAttempt,
  selectLatestFailedAttempt,
  selectLatestSuccessfulBuild,
} from "@/lib/projects/deployment-resolution";

const older = new Date("2026-07-07T01:00:00.000Z");
const newer = new Date("2026-07-07T02:00:00.000Z");

describe("deployment resolution policy", () => {
  it("accepts only build and deployment records with matching project lineage", () => {
    const build = {
      artifactRef: "project-artifact:s3:dist:build_1",
      id: "build_1",
      projectId: "project_1",
      snapshot: { id: "snapshot_1", projectId: "project_1" },
      snapshotId: "snapshot_1",
      status: "succeeded",
    };
    const deployment = {
      build,
      buildId: "build_1",
      id: "deployment_1",
      kind: "preview",
      projectId: "project_1",
      snapshot: { id: "snapshot_1", projectId: "project_1" },
      snapshotId: "snapshot_1",
    };

    expect(isProjectBuildForProject(build, "project_1")).toBe(true);
    expect(isProjectDeploymentForProject(deployment, "project_1")).toBe(true);
    expect(
      isProjectDeploymentForProject(
        {
          ...deployment,
          snapshotId: "other_snapshot",
        },
        "project_1",
      ),
    ).toBe(false);
    expect(
      isProjectBuildForProject(
        { ...build, snapshot: { id: "snapshot_1", projectId: "project_2" } },
        "project_1",
      ),
    ).toBe(false);
  });

  it("keeps the latest successful preview active when a newer build fails", () => {
    const successfulBuild = {
      artifactRef: "project-artifact:s3:dist:build_success",
      createdAt: older,
      id: "build_success",
      snapshotId: "snapshot_success",
      status: "succeeded",
    };
    const failedBuild = {
      artifactRef: null,
      createdAt: newer,
      id: "build_failed",
      snapshotId: "snapshot_failed",
      status: "failed",
    };
    const deployments = [
      {
        build: failedBuild,
        buildId: failedBuild.id,
        createdAt: newer,
        id: "deployment_failed",
        kind: "preview",
        snapshotId: failedBuild.snapshotId,
        status: "failed",
        updatedAt: newer,
      },
      {
        build: successfulBuild,
        buildId: successfulBuild.id,
        createdAt: older,
        id: "deployment_success",
        kind: "preview",
        snapshotId: successfulBuild.snapshotId,
        status: "running",
        updatedAt: older,
      },
    ];

    expect(selectLatestAttempt([successfulBuild, failedBuild])?.id).toBe(
      "build_failed",
    );
    expect(selectLatestFailedAttempt([successfulBuild, failedBuild])?.id).toBe(
      "build_failed",
    );
    expect(
      selectLatestSuccessfulBuild([successfulBuild, failedBuild])?.id,
    ).toBe("build_success");
    expect(selectActivePreviewDeployment(deployments)?.id).toBe(
      "deployment_success",
    );
  });

  it("ignores successful builds whose artifact reference is not owned by the build", () => {
    const mismatchedBuild = {
      artifactRef: "project-artifact:s3:dist:other_build",
      createdAt: newer,
      id: "build_success",
      snapshotId: "snapshot_success",
      status: "succeeded",
    };

    expect(selectLatestSuccessfulBuild([mismatchedBuild])).toBeNull();
  });

  it("ignores published deployments whose build is not a successful artifact", () => {
    const successfulBuild = {
      artifactRef: "project-artifact:s3:dist:build_success",
      createdAt: older,
      id: "build_success",
      snapshotId: "snapshot_success",
      status: "succeeded",
    };
    const runningBuild = {
      artifactRef: null,
      createdAt: newer,
      id: "build_running",
      snapshotId: "snapshot_running",
      status: "running",
    };

    expect(
      selectActivePublishedDeployment([
        {
          build: runningBuild,
          buildId: runningBuild.id,
          createdAt: newer,
          id: "published_running",
          kind: "published",
          publicPath: "/p/new",
          slug: "new",
          status: "created",
          updatedAt: newer,
        },
        {
          build: successfulBuild,
          buildId: successfulBuild.id,
          createdAt: older,
          id: "published_success",
          kind: "published",
          publicPath: "/p/live",
          slug: "live",
          snapshotId: successfulBuild.snapshotId,
          status: "running",
          updatedAt: older,
        },
      ])?.id,
    ).toBe("published_success");
  });
});

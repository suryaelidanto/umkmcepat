import { devLog } from "@/lib/dev-log";
import {
  classifyBuildFailure,
  sanitizeBuildLog,
  type BuildFailureReason,
} from "@/lib/projects/build-logs";
import { buildGeneratedProject } from "@/lib/projects/generated-source";
import {
  type GeneratedDistFile,
  type GeneratedProjectFile,
} from "@/lib/projects/generated-types";
import { writeProjectDistArtifact } from "@/lib/projects/runtime-artifacts";
import { type ProjectBuildStatus } from "@/lib/projects/runtime-types";

export type BuildWorkerResult = {
  artifactRef: string | null;
  distFiles: GeneratedDistFile[];
  failureReason: BuildFailureReason | null;
  logText: string;
  status: Extract<ProjectBuildStatus, "failed" | "succeeded">;
};

export type LocalBuildWorkerOptions = {
  buildProject?: typeof buildGeneratedProject;
  writeArtifact?: typeof writeProjectDistArtifact;
};

let activeBuilds = 0;

export function createLocalBuildWorker({
  buildProject = buildGeneratedProject,
  writeArtifact = writeProjectDistArtifact,
}: LocalBuildWorkerOptions = {}) {
  return {
    async runBuild({
      buildId,
      files,
      workspaceKey,
    }: {
      buildId: string;
      files: GeneratedProjectFile[];
      workspaceKey?: string;
    }): Promise<BuildWorkerResult> {
      devLog("build-worker", "start", {
        activeBuilds,
        buildId,
        files: files.length,
      });

      if (activeBuilds >= getBuildConcurrencyLimit()) {
        return failed(
          "Build worker concurrency limit reached.",
          "concurrency_limit",
        );
      }

      activeBuilds += 1;

      try {
        const result = await buildProject(
          files,
          workspaceKey ? { workspaceKey } : {},
        );
        const logText = sanitizeBuildLog(result.log);

        if (!result.ok) {
          devLog("build-worker", "failed", {
            buildId,
            reason: classifyBuildFailure(logText),
          });
          return failed(logText, classifyBuildFailure(logText));
        }

        try {
          const artifactRef = await writeArtifact({
            artifactId: buildId,
            files: result.distFiles,
          });
          devLog("build-worker", "succeeded", {
            artifactRef,
            buildId,
            distFiles: result.distFiles.length,
          });
          return {
            artifactRef,
            distFiles: result.distFiles,
            failureReason: null,
            logText,
            status: "succeeded",
          };
        } catch (error) {
          return failed(
            sanitizeBuildLog(
              `Artifact write failed. ${error instanceof Error ? error.message : ""}`,
            ),
            "artifact_write_failure",
          );
        }
      } finally {
        activeBuilds -= 1;
      }
    },
  };
}

export function isStaleBuildAttempt({
  now = new Date(),
  startedAt,
  staleAfterMs = 10 * 60 * 1000,
  status,
}: {
  now?: Date;
  staleAfterMs?: number;
  startedAt?: Date | null;
  status: string;
}) {
  return (
    status === "running" &&
    startedAt instanceof Date &&
    now.getTime() - startedAt.getTime() > staleAfterMs
  );
}

function getBuildConcurrencyLimit() {
  const parsed = Number(process.env.PROJECT_BUILD_CONCURRENCY || "1");

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function failed(
  logText: string,
  failureReason: BuildFailureReason,
): BuildWorkerResult {
  return {
    artifactRef: null,
    distFiles: [],
    failureReason,
    logText,
    status: "failed",
  };
}

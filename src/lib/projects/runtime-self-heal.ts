import type { StepCharger } from "@/lib/projects/energy-step-charger";
import type { GeneratedProjectFile } from "@/lib/projects/generated-types";
import type { ImplementationSpec } from "@/lib/projects/implementation-spec";
import type { ProjectSiteSchema } from "@/lib/projects/site-schema";

import { isGeneratedBuildExecutionEnabled } from "@/lib/config";
import { devLog } from "@/lib/dev-log";
import { captureRuntimeErrors } from "@/lib/projects/capture-runtime-errors";
import { repairRuntimeErrors } from "@/lib/projects/custom-source-generator";
import { buildGeneratedProject } from "@/lib/projects/generated-source";
import { writeProjectDistArtifact } from "@/lib/projects/runtime-artifacts";
import { getRuntimeSupervisor } from "@/lib/projects/runtime-supervisor";

export type RuntimeSelfHealResult = {
  ok: boolean;
  files: GeneratedProjectFile[];
  artifactRef: string | null;
  runtimeErrors: string[];
  repairUsed: boolean;
  usage?: { inputTokens: number; outputTokens: number };
};

type RuntimeSelfHealDeps = {
  captureErrors?: (url: string) => Promise<string[]>;
  repair?: typeof repairRuntimeErrors;
  build?: typeof buildGeneratedProject;
  writeArtifact?: typeof writeProjectDistArtifact;
  supervisor?: ReturnType<typeof getRuntimeSupervisor>;
};

export async function runRuntimeSelfHeal({
  artifactRef,
  files,
  implementationSpec,
  onProgress,
  projectId,
  schema,
  stepCharger,
  deps = {},
}: {
  artifactRef: string;
  files: GeneratedProjectFile[];
  implementationSpec?: ImplementationSpec;
  onProgress?: (event: { label: string; detail?: string }) => void;
  projectId: string;
  schema: ProjectSiteSchema;
  stepCharger?: StepCharger;
  deps?: RuntimeSelfHealDeps;
}): Promise<RuntimeSelfHealResult> {
  if (!isGeneratedBuildExecutionEnabled()) {
    return {
      artifactRef,
      files,
      ok: true,
      repairUsed: false,
      runtimeErrors: [],
    };
  }

  const supervisor = deps.supervisor ?? getRuntimeSupervisor();
  const capture = deps.captureErrors ?? captureRuntimeErrors;
  const repair = deps.repair ?? repairRuntimeErrors;
  const build = deps.build ?? buildGeneratedProject;
  const writeArtifact = deps.writeArtifact ?? writeProjectDistArtifact;

  // Start the runtime so we can capture console errors from the live dist.
  await supervisor.startDeployment(artifactRef);
  const target = await supervisor.resolveDeploymentTarget(artifactRef);
  if (!target) {
    devLog("runtime-self-heal", "no-target", { artifactRef });
    return {
      artifactRef,
      files,
      ok: true,
      repairUsed: false,
      runtimeErrors: [],
    };
  }

  onProgress?.({
    detail: "Memeriksa error runtime...",
    label: "runtime-check",
  });
  const errors = await capture(target.toString());
  onProgress?.({
    detail: `${errors.length} error runtime ditemukan`,
    label: "runtime-errors",
  });

  if (errors.length === 0) {
    return {
      artifactRef,
      files,
      ok: true,
      repairUsed: false,
      runtimeErrors: [],
    };
  }

  // Bounded 1+1: one repair pass, one rebuild.
  onProgress?.({
    detail: "Memperbaiki error runtime...",
    label: "runtime-repair",
  });
  const repairResult = await repair({
    files,
    implementationSpec,
    projectId,
    runtimeErrors: errors,
    schema,
    stepCharger,
  });

  onProgress?.({ detail: "Membangun ulang...", label: "runtime-rebuild" });
  const rebuild = await build(repairResult.files, { workspaceKey: projectId });
  if (!rebuild.ok) {
    return {
      artifactRef: null,
      files: repairResult.files,
      ok: false,
      repairUsed: true,
      runtimeErrors: errors,
      usage: repairResult.usage,
    };
  }

  const newArtifactRef = await writeArtifact({
    artifactId: artifactRef,
    files: rebuild.distFiles,
  });

  return {
    artifactRef: newArtifactRef,
    files: repairResult.files,
    ok: true,
    repairUsed: true,
    runtimeErrors: errors,
    usage: repairResult.usage,
  };
}

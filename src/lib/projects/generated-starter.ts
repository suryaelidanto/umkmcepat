import { validateGeneratedAppManifest } from "@/lib/projects/generated-app-manifest";
import { type GeneratedProjectFile } from "@/lib/projects/generated-types";
import { createViteTanStackShadcnStarterFiles } from "@/lib/projects/scaffold/vite-tanstack-shadcn-starter";
import { type ProjectSiteSchema } from "@/lib/projects/site-schema";

export function createGeneratedViteTanStackStarterFiles(
  projectId: string,
  schema: ProjectSiteSchema,
): GeneratedProjectFile[] {
  return createViteTanStackShadcnStarterFiles(projectId, schema);
}

export function createGeneratedProjectFiles(
  projectId: string,
  schema: ProjectSiteSchema,
): GeneratedProjectFile[] {
  return createGeneratedViteTanStackStarterFiles(projectId, schema);
}

export function createGeneratedSourceSnapshotMetadata(
  files: GeneratedProjectFile[],
  schema: ProjectSiteSchema,
  generation?: {
    generationMode?: "agentic" | "retry_build";
    operationTrace?: Array<{
      detail: string;
      path?: string;
      state: string;
      title: string;
      type: string;
    }>;
    skillDigestVersion?: string;
    skillsRead?: string[];
    summary?: string;
    touchedFiles?: string[];
  },
) {
  const manifestResult = validateGeneratedAppManifest(files);
  const manifest = manifestResult.ok ? manifestResult.manifest : null;

  return {
    manifest,
    manifestIssues: manifestResult.ok ? [] : manifestResult.issues,
    generation: generation
      ? {
          mode: generation.generationMode,
          operationTrace: generation.operationTrace ?? [],
          skillDigestVersion: generation.skillDigestVersion,
          skillsRead: generation.skillsRead ?? [],
          summary: generation.summary,
          touchedFiles: generation.touchedFiles ?? [],
        }
      : undefined,
    origin: {
      generator:
        generation?.generationMode === "agentic" ? "agentic" : "site-schema",
      sourceType: "generated",
    },
    schemaVersion: schema.version,
    sourceFileCount: files.length,
    summary: {
      businessName: schema.businessName,
      capabilities: manifest?.capabilities ?? [],
      routeCount: manifest?.routes.length ?? 0,
      runtimeProfile: manifest?.runtimeProfile ?? null,
      templateId: manifest?.templateId ?? null,
    },
    template: manifest?.templateId ?? "vite-react-frontend-static-v1",
  };
}

import { type GeneratedProjectFile } from "@/lib/projects/generated-source";

export const GENERATED_APP_MANIFEST_PATH = ".umkmcepat/project.json";

const SUPPORTED_RUNTIME_PROFILES = new Set([
  "static-react-v1",
  "vite-react-tanstack-v1",
]);
const SUPPORTED_CAPABILITIES = new Set([
  "catalog",
  "lead_intent",
  "location",
  "payment_link_placeholder",
  "static_content",
  "whatsapp_cta",
]);

export type GeneratedAppManifest = {
  buildCommand: "bun run build";
  capabilities: string[];
  outputDirectory: "dist";
  packageManager: "bun";
  projectId: string;
  routes: Array<{ path: string; title: string }>;
  runtimeProfile: "static-react-v1" | "vite-react-tanstack-v1";
  schemaVersion: "1";
  templateId: string;
  templateVersion: string;
};

export type GeneratedAppManifestValidationResult =
  | { issues: string[]; manifest: null; ok: false }
  | { issues: []; manifest: GeneratedAppManifest; ok: true };

export function validateGeneratedAppManifest(
  files: GeneratedProjectFile[],
): GeneratedAppManifestValidationResult {
  const manifestFile = files.find(
    (file) => file.path === GENERATED_APP_MANIFEST_PATH,
  );

  if (!manifestFile) {
    return invalid(["Missing .umkmcepat/project.json manifest."]);
  }

  let value: unknown;

  try {
    value = JSON.parse(manifestFile.content);
  } catch {
    return invalid(["Manifest JSON is invalid."]);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalid(["Manifest must be an object."]);
  }

  const manifest = value as Partial<GeneratedAppManifest>;
  const issues: string[] = [];

  if (manifest.schemaVersion !== "1") {
    issues.push('Manifest schemaVersion must be "1".');
  }

  if (!isNonEmptyString(manifest.projectId)) {
    issues.push("Manifest projectId is required.");
  }

  if (!isNonEmptyString(manifest.templateId)) {
    issues.push("Manifest templateId is required.");
  }

  if (!isNonEmptyString(manifest.templateVersion)) {
    issues.push("Manifest templateVersion is required.");
  }

  if (
    !isNonEmptyString(manifest.runtimeProfile) ||
    !SUPPORTED_RUNTIME_PROFILES.has(manifest.runtimeProfile)
  ) {
    issues.push("Manifest runtimeProfile is unsupported.");
  }

  if (manifest.packageManager !== "bun") {
    issues.push('Manifest packageManager must be "bun".');
  }

  if (manifest.buildCommand !== "bun run build") {
    issues.push('Manifest buildCommand must be "bun run build".');
  }

  if (manifest.outputDirectory !== "dist") {
    issues.push('Manifest outputDirectory must be "dist".');
  }

  if (!Array.isArray(manifest.capabilities)) {
    issues.push("Manifest capabilities must be an array.");
  } else {
    for (const capability of manifest.capabilities) {
      if (
        typeof capability !== "string" ||
        !SUPPORTED_CAPABILITIES.has(capability)
      ) {
        issues.push(
          `Manifest capability is unsupported: ${String(capability)}`,
        );
      }
    }
  }

  const routeIssues = getRouteIssues(manifest.routes);
  issues.push(...routeIssues);

  if (issues.length) {
    return invalid(issues);
  }

  return {
    issues: [],
    manifest: manifest as GeneratedAppManifest,
    ok: true,
  };
}

function getRouteIssues(routes: unknown) {
  if (!Array.isArray(routes) || routes.length === 0) {
    return ["Manifest routes must include at least one route."];
  }

  const issues: string[] = [];
  const seen = new Set<string>();

  for (const route of routes) {
    if (!route || typeof route !== "object" || Array.isArray(route)) {
      issues.push("Manifest route entries must be objects.");
      continue;
    }

    const item = route as { path?: unknown; title?: unknown };
    const routePath = typeof item.path === "string" ? item.path : "";

    if (!isSafeRoutePath(routePath)) {
      issues.push(`Manifest route path is invalid: ${String(item.path)}`);
    } else if (seen.has(routePath)) {
      issues.push(`Manifest route path is duplicated: ${routePath}`);
    } else {
      seen.add(routePath);
    }

    if (!isNonEmptyString(item.title) || item.title.length > 100) {
      issues.push(`Manifest route title is invalid: ${String(item.title)}`);
    }
  }

  return issues;
}

function isSafeRoutePath(value: string) {
  return (
    value === "/" ||
    (/^\/[a-z0-9][a-z0-9\-/_]*$/i.test(value) &&
      !value.includes("..") &&
      !value.includes("//"))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function invalid(issues: string[]): GeneratedAppManifestValidationResult {
  return { issues, manifest: null, ok: false };
}

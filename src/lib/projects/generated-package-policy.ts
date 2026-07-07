import { type GeneratedProjectFile } from "@/lib/projects/generated-source";

const ALLOWED_STATIC_REACT_PACKAGES = new Set([
  "@tailwindcss/vite",
  "@vitejs/plugin-react",
  "lucide-react",
  "react",
  "react-dom",
  "tailwindcss",
  "typescript",
  "vite",
]);

const BLOCKED_LIFECYCLE_SCRIPTS = new Set([
  "install",
  "postinstall",
  "preinstall",
  "prepare",
]);

export type GeneratedPackagePolicyResult =
  | { issues: string[]; ok: false }
  | { issues: []; ok: true };

export function validateGeneratedPackagePolicy(
  files: GeneratedProjectFile[],
  runtimeProfile: string,
): GeneratedPackagePolicyResult {
  if (runtimeProfile !== "static-react-v1") {
    return invalid([
      `Package policy does not support runtime profile: ${runtimeProfile}`,
    ]);
  }

  const packageFile = files.find((file) => file.path === "package.json");

  if (!packageFile) {
    return invalid(["Missing package.json."]);
  }

  let value: unknown;

  try {
    value = JSON.parse(packageFile.content);
  } catch {
    return invalid(["package.json is invalid JSON."]);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalid(["package.json must be an object."]);
  }

  const packageJson = value as {
    dependencies?: unknown;
    devDependencies?: unknown;
    optionalDependencies?: unknown;
    peerDependencies?: unknown;
    scripts?: unknown;
  };
  const issues = [
    ...getDependencyIssues(packageJson.dependencies, runtimeProfile),
    ...getDependencyIssues(packageJson.devDependencies, runtimeProfile),
    ...getDependencyIssues(packageJson.optionalDependencies, runtimeProfile),
    ...getDependencyIssues(packageJson.peerDependencies, runtimeProfile),
    ...getScriptIssues(packageJson.scripts),
  ];

  return issues.length ? invalid(issues) : { issues: [], ok: true };
}

function getDependencyIssues(value: unknown, runtimeProfile: string) {
  if (value == null) {
    return [];
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Package dependencies must be objects."];
  }

  return Object.keys(value).flatMap((packageName) =>
    ALLOWED_STATIC_REACT_PACKAGES.has(packageName)
      ? []
      : [`Package is not allowed for ${runtimeProfile}: ${packageName}`],
  );
}

function getScriptIssues(value: unknown) {
  if (value == null) {
    return [];
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Package scripts must be an object."];
  }

  return Object.keys(value).flatMap((scriptName) =>
    BLOCKED_LIFECYCLE_SCRIPTS.has(scriptName)
      ? [`Package lifecycle script is not allowed: ${scriptName}`]
      : [],
  );
}

function invalid(issues: string[]): GeneratedPackagePolicyResult {
  return { issues, ok: false };
}

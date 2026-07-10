import { type GeneratedProjectFile } from "@/lib/projects/generated-source";

const ALLOWED_PACKAGES_BY_PROFILE: Record<string, Set<string>> = {
  "static-react-v1": new Set([
    "@tailwindcss/vite",
    "@vitejs/plugin-react",
    "lucide-react",
    "react",
    "react-dom",
    "tailwindcss",
    "typescript",
    "vite",
  ]),
  "vite-react-tanstack-v1": new Set([
    "@eslint/js",
    "@tanstack/react-query",
    "@tanstack/react-router",
    "@types/node",
    "@types/react",
    "@types/react-dom",
    "@vitejs/plugin-react",
    "clsx",
    "eslint",
    "eslint-plugin-react-hooks",
    "eslint-plugin-react-refresh",
    "globals",
    "lucide-react",
    "react",
    "react-dom",
    "typescript",
    "typescript-eslint",
    "vite",
  ]),
};

const BLOCKED_LIFECYCLE_SCRIPTS = new Set([
  "install",
  "postinstall",
  "preinstall",
  "prepare",
]);
const BLOCKED_PACKAGE_FIELDS = new Set([
  "bun",
  "overrides",
  "packageManager",
  "pnpm",
  "resolutions",
  "trustedDependencies",
  "workspaces",
]);
const ALLOWED_BUILD_SCRIPTS_BY_PROFILE: Record<string, Set<string>> = {
  "static-react-v1": new Set(["vite build", "tsc -b && vite build"]),
  "vite-react-tanstack-v1": new Set(["vite build", "tsc -b && vite build"]),
};

export type GeneratedPackagePolicyResult =
  { issues: string[]; ok: false } | { issues: []; ok: true };

export function validateGeneratedPackagePolicy(
  files: GeneratedProjectFile[],
  runtimeProfile: string,
): GeneratedPackagePolicyResult {
  if (!ALLOWED_PACKAGES_BY_PROFILE[runtimeProfile]) {
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
    ...getPackageFieldIssues(value as Record<string, unknown>),
    ...getDependencyIssues(packageJson.dependencies, runtimeProfile),
    ...getDependencyIssues(packageJson.devDependencies, runtimeProfile),
    ...getDependencyIssues(packageJson.optionalDependencies, runtimeProfile),
    ...getDependencyIssues(packageJson.peerDependencies, runtimeProfile),
    ...getScriptIssues(packageJson.scripts, runtimeProfile),
  ];

  return issues.length ? invalid(issues) : { issues: [], ok: true };
}

function getPackageFieldIssues(value: Record<string, unknown>) {
  return Object.keys(value).flatMap((field) =>
    BLOCKED_PACKAGE_FIELDS.has(field)
      ? [`Package field is not allowed: ${field}`]
      : [],
  );
}

function getDependencyIssues(value: unknown, runtimeProfile: string) {
  if (value == null) {
    return [];
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Package dependencies must be objects."];
  }

  return Object.entries(value).flatMap(([packageName, specifier]) => {
    if (!ALLOWED_PACKAGES_BY_PROFILE[runtimeProfile].has(packageName)) {
      return [`Package is not allowed for ${runtimeProfile}: ${packageName}`];
    }

    if (typeof specifier !== "string") {
      return [`Package version must be a string: ${packageName}`];
    }

    if (!isAllowedPackageSpecifier(specifier)) {
      return [
        `Package version is not allowed for ${packageName}: ${specifier}`,
      ];
    }

    return [];
  });
}

function isAllowedPackageSpecifier(value: string) {
  return /^(\^|~)?\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(value);
}

function getScriptIssues(value: unknown, runtimeProfile: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Package scripts must be an object."];
  }

  const scripts = value as Record<string, unknown>;
  const issues = Object.keys(scripts).flatMap((scriptName) =>
    BLOCKED_LIFECYCLE_SCRIPTS.has(scriptName)
      ? [`Package lifecycle script is not allowed: ${scriptName}`]
      : [],
  );
  const buildScript = scripts.build;

  if (
    typeof buildScript !== "string" ||
    !ALLOWED_BUILD_SCRIPTS_BY_PROFILE[runtimeProfile]?.has(buildScript)
  ) {
    issues.push(`Package build script is not allowed for ${runtimeProfile}.`);
  }

  return issues;
}

function invalid(issues: string[]): GeneratedPackagePolicyResult {
  return { issues, ok: false };
}

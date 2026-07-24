import { type GeneratedProjectFile } from "@/lib/projects/generated-types";

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
    "@radix-ui/react-accordion",
    "@radix-ui/react-alert-dialog",
    "@radix-ui/react-aspect-ratio",
    "@radix-ui/react-avatar",
    "@radix-ui/react-checkbox",
    "@radix-ui/react-collapsible",
    "@radix-ui/react-context-menu",
    "@radix-ui/react-dialog",
    "@radix-ui/react-dropdown-menu",
    "@radix-ui/react-hover-card",
    "@radix-ui/react-label",
    "@radix-ui/react-menubar",
    "@radix-ui/react-navigation-menu",
    "@radix-ui/react-popover",
    "@radix-ui/react-progress",
    "@radix-ui/react-radio-group",
    "@radix-ui/react-scroll-area",
    "@radix-ui/react-select",
    "@radix-ui/react-separator",
    "@radix-ui/react-slider",
    "@radix-ui/react-slot",
    "@radix-ui/react-switch",
    "@radix-ui/react-tabs",
    "@radix-ui/react-toggle",
    "@radix-ui/react-toggle-group",
    "@radix-ui/react-tooltip",
    "@tailwindcss/vite",
    "@tanstack/react-query",
    "@tanstack/react-router",
    "@types/node",
    "@types/react",
    "@types/react-dom",
    "@vitejs/plugin-react",
    "class-variance-authority",
    "clsx",
    "cmdk",
    "embla-carousel-react",
    "eslint",
    "eslint-plugin-react-hooks",
    "eslint-plugin-react-refresh",
    "globals",
    "input-otp",
    "lucide-react",
    "motion",
    "next-themes",
    "react",
    "react-day-picker",
    "react-dom",
    "react-hook-form",
    "react-resizable-panels",
    "sonner",
    "tailwind-merge",
    "tailwindcss",
    "typescript",
    "typescript-eslint",
    "vaul",
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
    ...getUndeclaredImportIssues(files, packageJson),
  ];

  return issues.length ? invalid(issues) : { issues: [], ok: true };
}

// Imports the generated app may use without declaring them in package.json. Vite resolves
// these by walking up to the platform's node_modules (which declares react/motion/etc. for
// its own use), silently bundling a second copy of react (or the dependency's own react)
// and crashing the generated app at runtime. Keep this minimal and platform-owned only.
const IMPLICIT_ALLOWED_PACKAGES = new Set<string>([
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react-dom/client",
]);

// Node built-in modules (and their `node:` aliases) that Vite/polyfills resolve without an
// npm package. The scaffold's platform-owned vite.config.ts imports `path` bare, and the
// app's own server/runtime scripts may `import "node:fs"`. These never hoist a second copy.
const NODE_BUILTIN_PACKAGES = new Set<string>([
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

const SOURCE_FILE_PATTERN = /\.[mc]?[tj]sx?$/;
// Captures the module specifier in `import ... from "X"` / `export ... from "X"`.
const IMPORT_FROM_PATTERN =
  /\b(?:import|export)[\s\S]*?\bfrom\s+["']([^"']+)["']/g;

function getUndeclaredImportIssues(
  files: GeneratedProjectFile[],
  packageJson: {
    dependencies?: unknown;
    devDependencies?: unknown;
    optionalDependencies?: unknown;
    peerDependencies?: unknown;
  },
): string[] {
  const declared = new Set<string>([
    ...dependencyKeys(packageJson.dependencies),
    ...dependencyKeys(packageJson.devDependencies),
    ...dependencyKeys(packageJson.optionalDependencies),
    ...dependencyKeys(packageJson.peerDependencies),
  ]);

  const issues: string[] = [];
  const flagged = new Set<string>();

  for (const file of files) {
    if (!SOURCE_FILE_PATTERN.test(file.path)) {
      continue;
    }

    for (const match of file.content.matchAll(IMPORT_FROM_PATTERN)) {
      const specifier = match[1];

      // Skip the platform alias, relative imports, URL imports, and node: built-ins —
      // none of these are npm packages that could hoist from the platform node_modules.
      if (
        specifier.startsWith("@/") ||
        specifier.startsWith(".") ||
        specifier.startsWith("/") ||
        specifier.startsWith("node:") ||
        /^(https?:|file:)/.test(specifier)
      ) {
        continue;
      }

      const packageName = packageNameOf(specifier);
      if (!packageName) {
        continue;
      }

      if (
        declared.has(packageName) ||
        IMPLICIT_ALLOWED_PACKAGES.has(packageName) ||
        NODE_BUILTIN_PACKAGES.has(packageName)
      ) {
        continue;
      }

      if (flagged.has(packageName)) {
        continue;
      }
      flagged.add(packageName);
      issues.push(
        `Source imports package not declared in package.json: ${packageName}`,
      );
    }
  }

  return issues;
}

function dependencyKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value as Record<string, unknown>);
}

// "motion/react" -> "motion", "@tanstack/react-router" -> "@tanstack/react-router",
// "react/jsx-runtime" -> "react/jsx-runtime" (kept so it maps to the react allow entry).
function packageNameOf(specifier: string): string | null {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    if (!scope || !name) {
      return null;
    }
    return `${scope}/${name}`;
  }
  const [name] = specifier.split("/");
  return name || null;
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

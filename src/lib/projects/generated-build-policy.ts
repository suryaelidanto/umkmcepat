import { validateGeneratedPackagePolicy } from "@/lib/projects/generated-package-policy";

export type GeneratedBuildPolicyFile = {
  content: string;
  path: string;
};

export type GeneratedBuildPolicyResult =
  { issues: string[]; ok: false } | { issues: []; ok: true };

export const PLATFORM_VITE_CONFIG = `import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
`;

const PLATFORM_OWNED_PATHS = new Set([
  "components.json",
  "generated-app.manifest.json",
  "package.json",
  "vite.config.ts",
]);
const VITE_CONFIG_PATH = /^vite\.config\.(?:cjs|cts|js|mjs|mts|ts)$/;
const EXECUTABLE_BUILD_CONFIG_PATH =
  /^(?:postcss|rollup|tailwind)\.config\.(?:cjs|cts|js|mjs|mts|ts)$/;

export function isPlatformOwnedGeneratedPath(filePath: string) {
  return (
    PLATFORM_OWNED_PATHS.has(filePath) ||
    VITE_CONFIG_PATH.test(filePath) ||
    EXECUTABLE_BUILD_CONFIG_PATH.test(filePath)
  );
}

export function validateGeneratedBuildPolicy(
  files: GeneratedBuildPolicyFile[],
  runtimeProfile: string,
): GeneratedBuildPolicyResult {
  const packageResult = validateGeneratedPackagePolicy(files, runtimeProfile);
  const issues = packageResult.ok ? [] : [...packageResult.issues];
  const viteConfigs = files.filter((file) => VITE_CONFIG_PATH.test(file.path));
  const unsupportedExecutableConfigs = files.filter((file) =>
    EXECUTABLE_BUILD_CONFIG_PATH.test(file.path),
  );

  issues.push(
    ...unsupportedExecutableConfigs.map(
      (file) => `Executable build configuration is not allowed: ${file.path}`,
    ),
  );

  if (viteConfigs.length > 1) {
    issues.push("Only one platform-owned Vite configuration is allowed.");
  }

  for (const config of viteConfigs) {
    if (
      config.path !== "vite.config.ts" ||
      normalizeConfig(config.content) !== normalizeConfig(PLATFORM_VITE_CONFIG)
    ) {
      issues.push(
        "Vite configuration must match the platform-owned configuration.",
      );
    }
  }

  return issues.length ? { issues, ok: false } : { issues: [], ok: true };
}

function normalizeConfig(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

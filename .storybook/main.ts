import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  addons: [
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-vitest",
    "@chromatic-com/storybook",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  staticDirs: ["../public"],
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  viteFinal: async (config, { configType }) => {
    // Storybook renders isolated components, so strip the full-stack plugins
    // (TanStack Start, Nitro, TanStack Router) that expect a server build and
    // would otherwise emit multiple entry points into the Storybook bundle.
    const stripPrefixes = ["tanstack", "nitro"];
    // The addon-vitest mocker injects an extra rollup entry that the Vite 8
    // rolldown static build rejects ("multiple entries"). It is only needed for
    // the vitest interaction-test run, not the static export, so drop it there.
    if (configType === "PRODUCTION") {
      stripPrefixes.push("storybook-inject-mocker");
    }
    if (Array.isArray(config.plugins)) {
      config.plugins = config.plugins.filter((plugin) => {
        const name =
          plugin && typeof plugin === "object" && "name" in plugin
            ? String((plugin as { name?: string }).name ?? "").toLowerCase()
            : "";
        return !stripPrefixes.some((needle) => name.includes(needle));
      });
    }

    config.build = {
      ...config.build,
      chunkSizeWarningLimit: 1400,
      rolldownOptions: {
        ...config.build?.rolldownOptions,
        checks: {
          ...config.build?.rolldownOptions?.checks,
          pluginTimings: false,
        },
      },
    };

    return config;
  },
};

export default config;

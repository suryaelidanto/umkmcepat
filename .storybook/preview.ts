import type { Preview } from "@storybook/nextjs-vite";

import "../src/app/globals.css";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "Dark workspace",
      options: {
        "Dark workspace": { name: "Dark workspace", value: "#151515" },
        "Warm base": { name: "Warm base", value: "#eceae4" },
        "Warm white": { name: "Warm white", value: "#fcfbf8" },
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      toc: true,
    },
    layout: "centered",
    nextjs: {
      appDirectory: true,
    },
    options: {
      storySort: {
        order: ["Guide", "Foundations", "Core UI", "Product UI"],
      },
    },
    viewport: {
      options: {
        mobile1: {
          name: "Mobile 390",
          styles: { height: "844px", width: "390px" },
          type: "mobile",
        },
        tablet: {
          name: "Tablet 768",
          styles: { height: "1024px", width: "768px" },
          type: "tablet",
        },
        desktop: {
          name: "Desktop 1440",
          styles: { height: "900px", width: "1440px" },
          type: "desktop",
        },
      },
    },
  },
};

export default preview;

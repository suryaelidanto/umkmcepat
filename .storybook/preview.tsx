import {
  RouterProvider,
  createRootRoute,
  createRouter,
  createMemoryHistory,
} from "@tanstack/react-router";

import type { Decorator, Preview } from "@storybook/react-vite";

import "../src/styles/globals.css";

// Wrap every story in a minimal in-memory TanStack Router so components that use
// Link / usePathname / useRouter render exactly as they do in the app.
const withRouter: Decorator = (Story) => {
  const rootRoute = createRootRoute({ component: () => <Story /> });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return <RouterProvider router={router} />;
};

const preview: Preview = {
  decorators: [withRouter],
  parameters: {
    a11y: { test: "error" },
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

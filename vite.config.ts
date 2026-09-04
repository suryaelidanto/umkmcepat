import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import {
  createRejectedPathResponse,
  resolveRejectedRequestPath,
} from "./src/lib/security/malformed-path";

function rejectUnsafeRequestPaths(): Plugin {
  return {
    name: "reject-unsafe-request-paths",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const rejectedPath = resolveRejectedRequestPath(request.url ?? "");

        if (!rejectedPath) {
          next();
          return;
        }

        const rejectedResponse = createRejectedPathResponse(rejectedPath);
        response.statusCode = rejectedResponse.status;
        rejectedResponse.headers.forEach((value, key) => {
          response.setHeader(key, value);
        });
        response.end("Not Found");
      });
    },
  };
}

// Bypass Vite transform for preview/published asset APIs
function bypassViteTransformForProjectApis(): Plugin {
  return {
    name: "bypass-vite-transform-project-apis",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? "";
        if (url.startsWith("/api/") || url.startsWith("/p/")) {
          req.headers["sec-fetch-dest"] = "document";
        }
        next();
      });
    },
  };
}

// Cache local font files in development to prevent FOUT re-fetching on refresh
function cacheStaticFonts(): Plugin {
  return {
    name: "cache-static-fonts",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith("/fonts/")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
        next();
      });
    },
  };
}

export default defineConfig({
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  css: {
    postcss: {},
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  server: {
    allowedHosts: ["dev.umkmcepat.com", "localhost", "127.0.0.1"],
    watch: {
      ignored: ["**/.data/**", "**/.output/**", "**/node_modules/**"],
    },
  },
  plugins: [
    rejectUnsafeRequestPaths(),
    bypassViteTransformForProjectApis(),
    cacheStaticFonts(),
    tailwindcss(),
    tanstackStart(),
    nitro({
      preset: "node",
      plugins: ["./src/lib/security/malformed-path-plugin.ts"],
    }),
    viteReact(),
  ],
});

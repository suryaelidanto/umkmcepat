import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Vite's transform middleware treats Sec-Fetch-Dest: script|style (and bare
 * .js/.css URLs) as module graph transforms. Preview assets live under
 * /api/projects/... and must hit TanStack route handlers instead — otherwise
 * the browser gets Express-style 404 and the iframe never posts ready.
 * Forcing document dest makes Vite skip transform (see isDocumentFetchDest).
 */
function bypassViteTransformForProjectApis(): Plugin {
  return {
    name: "bypass-vite-transform-project-apis",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? "";
        if (url.startsWith("/api/projects/")) {
          req.headers["sec-fetch-dest"] = "document";
        }
        next();
      });
    },
  };
}

export default defineConfig({
  // Expose the existing NEXT_PUBLIC_-prefixed public env vars to client code via
  // import.meta.env, so the browser bundle keeps reading the same variable names
  // it did under Next (e.g. the Turnstile site key) without renaming any env.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  // Tailwind v4 is handled by its dedicated Vite plugin; override any ambient
  // postcss.config so it is not applied twice.
  css: {
    postcss: {},
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  server: {
    watch: {
      // Ignore build artifacts and data directories to prevent Vite's file
      // watcher from triggering HMR when the source generator writes files.
      ignored: ["**/.data/**", "**/.output/**", "**/node_modules/**"],
    },
  },
  plugins: [
    bypassViteTransformForProjectApis(),
    tailwindcss(),
    tanstackStart(),
    nitro({ preset: "bun" }),
    viteReact(),
  ],
});

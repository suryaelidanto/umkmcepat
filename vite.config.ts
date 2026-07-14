import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
    tailwindcss(),
    tanstackStart(),
    nitro({ preset: "bun" }),
    viteReact(),
  ],
});

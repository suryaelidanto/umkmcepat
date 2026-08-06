import { AsyncLocalStorage } from "node:async_hooks";

import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { register } from "@/lib/instrumentation";

// Initialize the global nonce store on server boot
globalThis.__nonceStore = new AsyncLocalStorage<string>();
// Initialize the per-request auth memoization store on server boot
globalThis.__authStore = new AsyncLocalStorage<Map<string, unknown>>();

// Run one-time startup validation + observability setup at server boot.
const ready = register().catch((error) => {
  // Surface startup/config failures loudly; do not silently serve a broken app.
  console.error("[instrumentation] startup failed:", error);
  throw error;
});

export default createServerEntry({
  async fetch(request) {
    await ready;
    return handler.fetch(request);
  },
});

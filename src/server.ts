import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { register } from "@/lib/instrumentation";
import { initSentry } from "@/lib/sentry";

initSentry();

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

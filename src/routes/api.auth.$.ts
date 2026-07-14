import { createFileRoute } from "@tanstack/react-router";

import { handleAuthRequest } from "@/lib/auth";

// Catch-all for every Auth.js Core endpoint: sign-in, OAuth callback,
// sign-out, csrf, session, providers. Replaces the previous
// /api/auth/[...nextauth] route.
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthRequest(request),
      POST: ({ request }) => handleAuthRequest(request),
    },
  },
});

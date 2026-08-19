import { createFileRoute } from "@tanstack/react-router";

import { handleAuthRequest } from "@/lib/auth/auth";
import { verifyTurnstileVerification } from "@/lib/auth/turnstile-gate";

// Matches signin initiation only: /api/auth/signin/<provider>. The OAuth
// callback (/api/auth/callback/*) is a redirect back from the provider and is
// NOT gated — the gate ran when the signin was initiated.
const SIGNIN_PATH = /^\/api\/auth\/signin\/[^/]+$/;

// Catch-all for every Auth.js Core endpoint: sign-in, OAuth callback,
// sign-out, csrf, session, providers. Replaces the previous
// /api/auth/[...nextauth] route.
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthRequest(request),
      POST: ({ request }) => {
        const { pathname } = new URL(request.url);

        if (
          SIGNIN_PATH.test(pathname) &&
          !verifyTurnstileVerification(request)
        ) {
          return Response.json(
            { message: "Verifikasi belum berhasil. Coba lagi." },
            { status: 403 },
          );
        }

        return handleAuthRequest(request);
      },
    },
  },
});

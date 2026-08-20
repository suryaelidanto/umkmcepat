import { createFileRoute } from "@tanstack/react-router";

import { handleAuthRequest } from "@/lib/auth/auth";
import { verifyTurnstileVerification } from "@/lib/auth/turnstile-gate";

// Matches signin initiation only: /api/auth/signin/<provider>. The OAuth
const SIGNIN_PATH = /^\/api\/auth\/signin\/[^/]+$/;

// Catch-all for every Auth.js Core endpoint: sign-in, OAuth callback,
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

import { createFileRoute } from "@tanstack/react-router";

import { getEnv } from "@/lib/config";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { turnstileVerifiedCookie } from "@/lib/turnstile-gate";

export const Route = createFileRoute("/api/auth/turnstile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          token?: unknown;
        };
        const ok = await verifyTurnstileToken(body.token);

        if (!ok) {
          return Response.json(
            { message: "Verifikasi belum berhasil. Coba lagi." },
            { status: 400 },
          );
        }

        const secure = /^https:/.test(getEnv("NEXTAUTH_URL") || "");

        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": turnstileVerifiedCookie(secure),
          },
        });
      },
    },
  },
});

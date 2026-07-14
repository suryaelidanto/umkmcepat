import { createFileRoute } from "@tanstack/react-router";

import { verifyTurnstileToken } from "@/lib/turnstile";

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

        return Response.json({ ok: true });
      },
    },
  },
});

import { verifyTurnstileToken } from "@/lib/turnstile";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  const ok = await verifyTurnstileToken(body.token);

  if (!ok) {
    return Response.json(
      { message: "Verifikasi belum berhasil. Coba lagi." },
      { status: 400 },
    );
  }

  return Response.json({ ok: true });
}

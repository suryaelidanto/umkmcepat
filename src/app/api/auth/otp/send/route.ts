import { auth } from "@/lib/auth";
import { createOtpRequest, sendOtpViaSms } from "@/lib/otp";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const rateLimitResponse = await checkRateLimit(
    request,
    "otp",
    session.user.id,
  );
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let body: { phone?: string };

  try {
    body = (await request.json()) as { phone?: string };
  } catch {
    return Response.json(
      { message: "Format request tidak valid." },
      { status: 400 },
    );
  }

  const phone = body.phone?.trim();

  if (!phone || !/^\+?[0-9]{10,15}$/.test(phone)) {
    return Response.json(
      { message: "Nomor telepon tidak valid. Gunakan format: +6281234567890" },
      { status: 400 },
    );
  }

  const { code, expiresAt } = await createOtpRequest(session.user.id, phone);
  const result = await sendOtpViaSms(phone, code);

  if (!result.success) {
    return Response.json({ message: result.error }, { status: 500 });
  }

  return Response.json({
    message: "Kode OTP telah dikirim ke WhatsApp kamu.",
    expiresAt: expiresAt.toISOString(),
  });
}

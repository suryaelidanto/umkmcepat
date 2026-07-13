import { auth } from "@/lib/auth";
import { verifyOtp } from "@/lib/otp";
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

  let body: { phone?: string; code?: string };

  try {
    body = (await request.json()) as { phone?: string; code?: string };
  } catch {
    return Response.json(
      { message: "Format request tidak valid." },
      { status: 400 },
    );
  }

  const phone = body.phone?.trim();
  const code = body.code?.trim();

  if (!phone || !code) {
    return Response.json(
      { message: "Nomor telepon dan kode OTP wajib diisi." },
      { status: 400 },
    );
  }

  const result = await verifyOtp(session.user.id, phone, code);

  if (!result.success) {
    return Response.json({ message: result.error }, { status: 400 });
  }

  return Response.json({
    message: "Verifikasi berhasil! Selamat datang di UMKM Cepat.",
  });
}

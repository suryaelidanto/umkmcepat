import { moderateProjectRequest } from "@/lib/ai-moderation";
import { auth } from "@/lib/auth";
import { validateProjectRequest } from "@/lib/projects/input";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type ModerationBody = { prompt?: string };

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
    "ai",
    session.user.id,
  );

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const body = (await request.json().catch(() => ({}))) as ModerationBody;
  const validation = validateProjectRequest(body.prompt ?? "");

  if (!validation.ok) {
    return Response.json(
      { allowed: false, message: validation.message },
      { status: 400 },
    );
  }

  const result = await moderateProjectRequest(validation.value).catch(() => ({
    allowed: false as const,
    message: "Checker keamanan lagi lambat. Coba kirim lagi sebentar ya.",
  }));

  return Response.json(result);
}

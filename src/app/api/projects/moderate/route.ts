import { NextResponse } from "next/server";

import { moderateProjectRequest } from "@/lib/ai-moderation";
import { auth } from "@/lib/auth";
import { validateProjectRequest } from "@/lib/projects/input";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { allowed: false, message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const rateLimitResponse = await checkRateLimit(request, "ai");

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { prompt } = (await request.json()) as { prompt?: string };
  const validation = validateProjectRequest(prompt ?? "");

  if (!validation.ok) {
    return NextResponse.json(
      { allowed: false, message: validation.message },
      { status: 400 },
    );
  }

  const result = await moderateProjectRequest(validation.value);

  return NextResponse.json(result, { status: 200 });
}

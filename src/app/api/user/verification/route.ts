import { auth } from "@/lib/auth";
import { isUserVerified } from "@/lib/user-credits";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const verified = await isUserVerified(session.user.id);

  return Response.json({ verified });
}

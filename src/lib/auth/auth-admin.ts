import { auth } from "@/lib/auth/auth";
import { isAdminEmail } from "@/lib/waitlist/waitlist";

export type AuthedAdmin = {
  email: string;
  userId: string;
};

export type AdminCheck =
  | { ok: true; admin: AuthedAdmin }
  | { ok: false; status: number; message: string };

export async function requireAdmin(): Promise<AdminCheck> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return {
      message: "Masuk dulu sebagai admin.",
      ok: false,
      status: 401,
    };
  }
  if (!isAdminEmail(session.user.email)) {
    return {
      message: "Akses admin diperlukan.",
      ok: false,
      status: 403,
    };
  }
  return {
    admin: { email: session.user.email, userId: session.user.id },
    ok: true,
  };
}

import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/waitlist";

export type AuthedAdmin = {
  email: string;
  userId: string;
};

export type AdminCheck =
  | { ok: true; admin: AuthedAdmin }
  | { ok: false; status: number; message: string };

/**
 * Require an authenticated admin session. Admin is an env-driven email
 * allowlist (ADMIN_EMAILS) — no Role model, no migration. Returns a 401 for
 * anonymous users, 403 for authenticated-but-not-admin users.
 */
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

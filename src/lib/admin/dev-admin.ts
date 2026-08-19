import { requireAdmin, type AdminCheck } from "@/lib/auth/auth-admin";

export function canUseDevTools(input: {
  isDevelopment: boolean;
  isAdmin: boolean;
}): boolean {
  return input.isDevelopment && input.isAdmin;
}

export async function requireDevAdmin(): Promise<AdminCheck> {
  if (process.env.NODE_ENV !== "development") {
    return {
      ok: false,
      status: 403,
      message: "Endpoint ini hanya tersedia di mode development.",
    };
  }
  return requireAdmin();
}

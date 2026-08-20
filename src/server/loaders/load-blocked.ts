import "@tanstack/react-start/server-only";

import { redirect } from "@tanstack/react-router";

import { getAuthState } from "@/lib/auth/auth";

export async function loadBlocked() {
  const { session, banned } = await getAuthState();

  if (!session?.user?.id || !banned) {
    throw redirect({ to: "/" });
  }

  return { ok: true as const };
}

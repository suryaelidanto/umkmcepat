// Server-only loader for /blocked. Marked server-only via the
// @tanstack/react-start/server-only side-effect import so the import-protection
// plugin does not bundle it (or its transitive @/lib/auth import) into the
// client.
import "@tanstack/react-start/server-only";

import { redirect } from "@tanstack/react-router";

import { getAuthState } from "@/lib/auth";

export async function loadBlocked() {
  const { session, banned } = await getAuthState();

  if (!session?.user?.id || !banned) {
    throw redirect({ to: "/" });
  }

  return { ok: true as const };
}

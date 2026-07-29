// Server-only loader for /profile. Marked server-only via the
// @tanstack/react-start/server-only side-effect import so the import-protection
// plugin does not bundle it (or its transitive @/lib/auth + @/lib/prisma
// imports) into the client.
import "@tanstack/react-start/server-only";

import { redirect } from "@tanstack/react-router";

import { getAuthState } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function loadProfile() {
  const { session, banned } = await getAuthState();

  if (banned) {
    throw redirect({ to: "/blocked" });
  }

  if (!session?.user?.id) {
    throw redirect({ to: "/" });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true },
  });

  if (!user) {
    throw redirect({ to: "/" });
  }

  return {
    initialName: user.name || session.user.name || "",
  };
}

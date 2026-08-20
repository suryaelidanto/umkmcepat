import "@tanstack/react-start/server-only";

import { redirect } from "@tanstack/react-router";

import { getAuthState } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";

export async function loadProfile() {
  const { session, banned } = await getAuthState();

  if (banned) {
    throw redirect({ to: "/blocked" });
  }

  if (!session?.user?.id) {
    throw redirect({ to: "/" });
  }

  try {
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
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.warn(
      "[profile] DB unavailable - rendering degraded profile:",
      error instanceof Error ? error.message : error,
    );
    return {
      initialName: session.user.name || "",
    };
  }
}

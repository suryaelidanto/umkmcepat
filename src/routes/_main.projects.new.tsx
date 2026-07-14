import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { auth } from "@/lib/auth";

const guardNewProject = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth();

  if (!session?.user?.id) {
    throw redirect({ to: "/" });
  }

  // New-project entry always redirects home; the prompt form owns creation.
  throw redirect({ to: "/" });
});

export const Route = createFileRoute("/_main/projects/new")({
  loader: () => guardNewProject(),
  component: () => null,
});

import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { ProfileNameForm } from "@/components/profile/ProfileNameForm";
import { DarkCard, DarkPage } from "@/components/ui/surface";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toPublicProfileImage } from "@/lib/profile";

const loadProfile = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth();

  if (!session?.user?.id) {
    throw redirect({ to: "/" });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { image: true, name: true },
  });

  if (!user) {
    throw redirect({ to: "/" });
  }

  return {
    initialImage: toPublicProfileImage(user.image || session.user.image),
    initialName: user.name || session.user.name || "",
  };
});

export const Route = createFileRoute("/_main/profile")({
  loader: () => loadProfile(),
  component: ProfilePage,
});

function ProfilePage() {
  const { initialImage, initialName } = Route.useLoaderData();

  return (
    <DarkPage>
      <section className="mx-auto w-full max-w-2xl">
        <DarkCard>
          <ProfileNameForm
            initialImage={initialImage}
            initialName={initialName}
          />
        </DarkCard>
      </section>
    </DarkPage>
  );
}

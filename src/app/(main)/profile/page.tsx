import { redirect } from "next/navigation";

import { ProfileNameForm } from "@/components/profile/ProfileNameForm";
import { DarkCard, DarkPage } from "@/components/ui/surface";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toPublicProfileImage } from "@/lib/profile";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { image: true, name: true },
  });

  if (!user) {
    redirect("/");
  }

  return (
    <DarkPage>
      <section className="mx-auto w-full max-w-2xl">
        <DarkCard>
          <ProfileNameForm
            initialImage={toPublicProfileImage(
              user.image || session.user.image,
            )}
            initialName={user.name || session.user.name || ""}
          />
        </DarkCard>
      </section>
    </DarkPage>
  );
}

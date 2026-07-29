import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { ProfileNameForm } from "@/components/profile/ProfileNameForm";
import { loadProfile } from "@/server/loaders/load-profile";

const loadProfileServer = createServerFn({ method: "GET" }).handler(
  loadProfile,
);

export const Route = createFileRoute("/_main/profile")({
  loader: () => loadProfileServer(),
  component: ProfilePage,
});

function ProfilePage() {
  const { initialName } = Route.useLoaderData();

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-[#151515] px-4 py-spacing-12 text-surface-warm-white sm:px-spacing-9 lg:px-spacing-10">
      <section className="mx-auto w-full max-w-xl">
        <ProfileNameForm initialName={initialName} />
      </section>
    </main>
  );
}

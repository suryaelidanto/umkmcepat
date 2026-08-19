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
    <main className="min-h-[calc(100dvh-4rem)] bg-[#eceae4] px-3 py-spacing-12 text-[#1c1c1c] transition-colors duration-200 dark:bg-[#151515] dark:text-surface-warm-white sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-xl">
        <ProfileNameForm initialName={initialName} />
      </section>
    </main>
  );
}

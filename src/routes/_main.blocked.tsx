import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { signOut } from "@/lib/auth-client";
import { loadBlocked } from "@/server/loaders/load-blocked";

const loadBlockedServer = createServerFn({ method: "GET" }).handler(
  loadBlocked,
);

export const Route = createFileRoute("/_main/blocked")({
  loader: () => loadBlockedServer(),
  component: BlockedPage,
});

function BlockedPage() {
  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-[#151515] px-4 py-spacing-12 text-surface-warm-white sm:px-spacing-9 lg:px-spacing-10">
      <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-spacing-8 text-center">
        <h1 className="font-heading text-3xl font-semibold sm:text-4xl">
          Akun Anda diblokir
        </h1>
        <p className="text-base text-surface-warm-white/80 sm:text-lg">
          Akun Anda diblokir. Hubungi admin di{" "}
          <a
            href="mailto:hello@umkmcepat.com"
            className="underline underline-offset-4 hover:text-surface-warm-white"
          >
            hello@umkmcepat.com
          </a>{" "}
          untuk info lebih lanjut.
        </p>
        <button
          type="button"
          onClick={() => {
            void signOut({ callbackUrl: "/" });
          }}
          className="rounded-md border border-white/20 bg-white/5 px-spacing-6 py-spacing-3 text-sm font-medium text-surface-warm-white transition hover:bg-white/10"
        >
          Keluar
        </button>
      </section>
    </main>
  );
}

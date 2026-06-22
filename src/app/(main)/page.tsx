import Link from "next/link";

import { HomePromptForm } from "@/components/projects/HomePromptForm";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const session = await auth();
  const projects = session?.user?.id
    ? await prisma.landingPage.findMany({
        where: { userId: session.user.id },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: {
          id: true,
          businessName: true,
          category: true,
          updatedAt: true,
        },
      })
    : [];

  return (
    <div className="bg-[#151515] text-surface-warm-white">
      <section className="relative isolate overflow-hidden px-4 py-spacing-14 sm:px-spacing-9 lg:px-spacing-10">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(21,21,21,1)_0%,rgba(21,21,21,0.95)_16%,rgba(33,55,90,0.9)_32%,rgba(71,119,239,0.92)_50%,rgba(236,126,229,0.94)_66%,rgba(255,31,128,0.98)_82%,rgba(255,94,39,1)_100%)]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_18%,rgba(10,10,10,0.82)_0%,rgba(10,10,10,0.45)_18%,transparent_42%)]" />
        <div className="absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-[#151515] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-44 bg-gradient-to-t from-[#ff5e27] via-[#ff1f80]/70 to-transparent" />

        <div className="mx-auto flex min-h-[calc(100dvh-12rem)] w-full max-w-5xl flex-col items-center justify-center text-center">
          <p className="mb-spacing-5 rounded-full border border-surface-warm-white/10 bg-surface-warm-white/8 px-spacing-6 py-spacing-3 text-sm text-surface-warm-white/72">
            {session?.user ? "Dashboard proyek" : "AI builder untuk UMKM"}
          </p>
          <h1 className="max-w-4xl text-balance text-[clamp(3rem,6vw,5.4rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-surface-warm-white">
            {session?.user
              ? "Mau bikin apa hari ini?"
              : "Usahamu layak punya website. 100% gratis."}
          </h1>
          <p className="mt-spacing-7 max-w-2xl text-balance text-lg leading-7 text-surface-warm-white/72 sm:text-xl">
            {session?.user
              ? "Mulai dari prompt baru, atau lanjutkan proyek yang sudah kamu buat."
              : "Ceritakan usahamu, lalu biarkan AI menyusunnya jadi halaman online yang profesional dan siap kamu bagikan."}
          </p>

          <HomePromptForm />
        </div>
      </section>

      {session?.user ? (
        <section className="bg-[#151515] px-4 pb-spacing-14 sm:px-spacing-9 lg:px-spacing-10">
          <div className="mx-auto max-w-5xl rounded-[28px] border border-surface-warm-white/10 bg-[#1f1f1d] p-spacing-7 text-left shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:p-spacing-9">
            <div className="flex flex-col gap-spacing-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em]">
                  Proyek kamu
                </h2>
                <p className="mt-spacing-3 text-sm leading-6 text-surface-warm-white/62">
                  Semua pekerjaan dimulai dari prompt. Detail dan preview ada di
                  workspace proyek.
                </p>
              </div>
              <Button
                asChild
                variant="outline"
                className="border-surface-warm-white/14 bg-surface-warm-white/6 text-surface-warm-white hover:bg-surface-warm-white/12 hover:text-surface-warm-white"
              >
                <Link href="/projects/demo">Buka demo</Link>
              </Button>
            </div>

            {projects.length ? (
              <div className="mt-spacing-8 grid gap-spacing-5 md:grid-cols-2">
                {projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="rounded-radius-2xl border border-surface-warm-white/10 bg-surface-warm-white/6 p-spacing-7 outline-none transition hover:bg-surface-warm-white/10 focus-visible:ring-2 focus-visible:ring-surface-warm-white"
                  >
                    <p className="text-sm text-surface-warm-white/50">
                      {project.category}
                    </p>
                    <h3 className="mt-spacing-3 text-lg font-semibold tracking-[-0.03em]">
                      {project.businessName}
                    </h3>
                    <p className="mt-spacing-5 text-sm text-surface-warm-white/48">
                      Diubah {project.updatedAt.toLocaleDateString("id-ID")}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-spacing-8 rounded-radius-2xl border border-dashed border-surface-warm-white/14 bg-surface-warm-white/5 p-spacing-8 text-center">
                <h3 className="text-lg font-semibold tracking-[-0.03em]">
                  Belum ada proyek
                </h3>
                <p className="mx-auto mt-spacing-3 max-w-md text-sm leading-6 text-surface-warm-white/58">
                  Tulis prompt pertama kamu di atas. Workspace akan dibuat dari
                  sana.
                </p>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

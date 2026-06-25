import { revalidatePath } from "next/cache";

import { CommunitySection } from "@/components/home/CommunitySection";
import { HomePromptForm } from "@/components/projects/HomePromptForm";
import { ProjectList } from "@/components/projects/ProjectList";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const session = await auth();
  const [projects, user] = session?.user?.id
    ? await Promise.all([
        prisma.project.findMany({
          where: { userId: session.user.id },
          orderBy: { updatedAt: "desc" },
          take: 24,
          select: {
            id: true,
            title: true,
            updatedAt: true,
            status: true,
            buildStatus: true,
            builtAt: true,
          },
        }),
        prisma.user.findUnique({
          where: { id: session.user.id },
          select: { name: true },
        }),
      ])
    : [[], null];
  const greetingName = getGreetingName(user?.name || session?.user?.name);

  async function deleteProject(formData: FormData) {
    "use server";

    const session = await auth();
    const projectId = formData.get("projectId");

    if (!session?.user?.id || typeof projectId !== "string") {
      throw new Error("Unauthorized");
    }

    await prisma.project.deleteMany({
      where: {
        id: projectId,
        userId: session.user.id,
      },
    });

    revalidatePath("/");
  }

  return (
    <div className="bg-[#151515] text-surface-warm-white">
      <section className="relative isolate overflow-hidden px-4 py-spacing-14 sm:px-spacing-9 lg:px-spacing-10">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(21,21,21,1)_0%,rgba(21,21,21,0.95)_16%,rgba(33,55,90,0.9)_32%,rgba(71,119,239,0.92)_50%,rgba(236,126,229,0.94)_66%,rgba(255,31,128,0.98)_82%,rgba(255,94,39,1)_100%)]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_18%,rgba(10,10,10,0.82)_0%,rgba(10,10,10,0.45)_18%,transparent_42%)]" />
        <div className="absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-[#151515] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-44 bg-gradient-to-t from-[#ff5e27] via-[#ff1f80]/70 to-transparent" />

        <div className="mx-auto flex min-h-[calc(100dvh-12rem)] w-full max-w-5xl flex-col items-center justify-center text-center">
          <h1 className="max-w-4xl text-balance text-[clamp(3rem,6vw,5.4rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-surface-warm-white">
            {session?.user
              ? greetingName
                ? `Hai, ${greetingName}. Mau buat website apa hari ini?`
                : "Website apa yang mau kamu buat?"
              : "Usahamu layak punya website. 100% gratis."}
          </h1>
          <p className="mt-spacing-7 max-w-2xl text-balance text-lg leading-7 text-surface-warm-white/72 sm:text-xl">
            {session?.user
              ? "Tulis kebutuhan usahamu. AI bantu susun website yang cocok untuk pelangganmu."
              : "Tulis tentang usahamu. AI bantu buatkan website yang rapi, jelas, dan siap dibagikan."}
          </p>

          <HomePromptForm />
        </div>
      </section>

      {!session?.user ? <CommunitySection /> : null}

      {session?.user ? (
        <section className="bg-surface-base px-4 pb-spacing-15 pt-spacing-12 text-foreground-primary sm:px-spacing-9 lg:px-spacing-10">
          <div className="mx-auto max-w-6xl text-left">
            <div className="rounded-radius-3xl border border-[#d8d5cc] bg-surface-muted p-spacing-7 sm:p-spacing-10">
              <div className="max-w-2xl">
                <h2 className="text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
                  Website kamu
                </h2>
                <p className="mt-spacing-4 text-sm leading-6 text-text-secondary sm:text-base">
                  Lanjutkan website terakhir atau buka arsip pekerjaanmu.
                </p>
              </div>

              {projects.length ? (
                <div className="mt-spacing-10">
                  <ProjectList
                    projects={projects}
                    deleteProject={deleteProject}
                  />
                </div>
              ) : (
                <div className="mt-spacing-10 rounded-radius-2xl border border-dashed border-[#d8d5cc] bg-surface-warm-white p-spacing-10 text-center">
                  <h3 className="text-xl font-semibold tracking-[-0.04em]">
                    Belum ada website
                  </h3>
                  <p className="mx-auto mt-spacing-4 max-w-md text-sm leading-6 text-text-secondary">
                    Tulis kebutuhan usahamu di atas. Website barumu akan muncul
                    di sini.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function getGreetingName(name?: string | null) {
  return name?.trim().split(/\s+/)[0]?.slice(0, 32) || "";
}

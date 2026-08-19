import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState, type CSSProperties } from "react";

import { WhatsAppCommunityInvite } from "@/components/community/WhatsAppCommunityInvite";
import { CommunitySection } from "@/components/home/CommunitySection";
import { HeroAuroraBackground } from "@/components/home/HeroAuroraBackground";
import {
  HeroContentMotion,
  HeroMotionItem,
} from "@/components/home/HeroContentMotion";
import { ResetCursorOnMount } from "@/components/home/ResetCursorOnMount";
import { ScrollReveal } from "@/components/home/ScrollReveal";
import { HomePromptForm } from "@/components/projects/dashboard/HomePromptForm";
import { ProjectList } from "@/components/projects/dashboard/ProjectList";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { auth } from "@/lib/auth/auth";
import { useSession } from "@/lib/auth/auth-client";
import { resolveHomeAccessState } from "@/lib/home-access-state";
import {
  getProjectCount,
  getProjectLimit,
  isAtOrOverProjectLimit,
} from "@/lib/payment/user-credits";
import { prisma } from "@/lib/prisma";
import {
  encodeProjectCursor,
  PROJECT_PAGE_SIZE,
} from "@/lib/projects/pagination";
import {
  fetchWaitlistStatus,
  GATE_QUERY_OPTIONS,
  queryKeys,
  waitlistPendingPollInterval,
} from "@/lib/query-client";
import { isAdminEmail, isWaitlistApproved } from "@/lib/waitlist/waitlist";
import { isWaitlistEnabled } from "@/lib/waitlist/waitlist-enabled";
import { getOwnWaitlistEntry } from "@/lib/waitlist/waitlist-own-entry";
import { resolveUserWaitlistStatus } from "@/routes/api.user.waitlist";

const loadHome = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth().catch(() => null);
  try {
    const [projects, user] = session?.user?.id
      ? await Promise.all([
          prisma.project.findMany({
            where: { userId: session.user.id },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: PROJECT_PAGE_SIZE + 1,
            select: {
              buildStatus: true,
              id: true,
              thumbnailBuildId: true,
              thumbnailRef: true,
              title: true,
              updatedAt: true,
            },
          }),
          prisma.user.findUnique({
            where: { id: session.user.id },
            select: { name: true },
          }),
        ])
      : [[], null];
    const greetingName = getGreetingName(user?.name || session?.user?.name);
    const hasMore = projects.length > PROJECT_PAGE_SIZE;
    const initialProjects = hasMore
      ? projects.slice(0, PROJECT_PAGE_SIZE)
      : projects;
    const initialNextCursor = hasMore
      ? encodeProjectCursor(initialProjects[initialProjects.length - 1])
      : null;
    const projectCount = session?.user?.id
      ? await getProjectCount(session.user.id)
      : 0;
    const projectLimit = getProjectLimit();
    const overProjectLimit = isAtOrOverProjectLimit(projectCount, projectLimit);

    const email = session?.user?.email ?? null;
    const isAdmin = email ? isAdminEmail(email) : false;
    const waitlistEnabled = await isWaitlistEnabled();
    const isApproved = email ? await isWaitlistApproved(email) : null;
    const isDev = process.env.NODE_ENV === "development";
    const initialWaitlistStatus = session?.user?.id
      ? {
          ...resolveUserWaitlistStatus({
            email,
            isAdmin,
            isApproved,
            isDevelopment: isDev,
            waitlistEnabled,
          }),
          own:
            email && (!isAdmin || isDev)
              ? await getOwnWaitlistEntry(email)
              : undefined,
        }
      : null;

    return {
      greetingName,
      hasUser: Boolean(session?.user),
      initialNextCursor,
      initialProjects,
      initialWaitlistStatus,
      overProjectLimit,
      projectCount,
      projectLimit,
    };
  } catch (error) {
    console.warn(
      "[home] DB unavailable - rendering degraded homepage:",
      error instanceof Error ? error.message : error,
    );
    return {
      greetingName: getGreetingName(session?.user?.name),
      hasUser: Boolean(session?.user),
      initialNextCursor: null,
      initialProjects: [],
      initialWaitlistStatus: null,
      overProjectLimit: false,
      projectCount: 0,
      projectLimit: getProjectLimit(),
    };
  }
});

const deleteProjectFn = createServerFn({ method: "POST" })
  .validator((data: { projectId: string }) => data)
  .handler(async ({ data }) => {
    const session = await auth();
    const projectId = data.projectId;

    if (!session?.user?.id || typeof projectId !== "string") {
      throw new Error("Unauthorized");
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: session.user.id },
      select: { id: true, thumbnailRef: true },
    });

    if (!project) {
      throw new Error("Project not found");
    }

    await prisma.project.delete({
      where: { id: projectId },
    });
    return { success: true };
  });

function getGreetingName(fullName: string | null | undefined): string {
  if (!fullName) {
    return "";
  }
  const first = fullName.trim().split(" ")[0];
  return first ? first.slice(0, 1).toUpperCase() + first.slice(1) : "";
}

function HeroHeadline() {
  return (
    <span className="flex flex-wrap justify-center gap-x-[0.13em] gap-y-1">
      <span>Bikin</span>
      <span>Website</span>
      <span>UMKM</span>
      <span>dalam</span>
      <span>5</span>
      <span>Menit,</span>
      <span className="font-signature relative inline-block text-[1.28em] font-normal leading-[0.78] tracking-normal">
        100% Gratis.
        <span
          aria-hidden="true"
          className="absolute inset-x-0 -bottom-1 h-[5px] rounded-full bg-status-success"
        />
      </span>
    </span>
  );
}

function HeroSubline() {
  return "Tanpa coding, tanpa desainer, tanpa ribet.";
}

function CaraKerjaSection() {
  return (
    <section
      className="border-t-0 bg-[#eceae4] px-4 py-20 text-[#1c1c1c] transition-colors duration-200 dark:border-t dark:border-white/[0.07] dark:bg-[#151515] dark:text-surface-warm-white sm:px-spacing-9 lg:px-spacing-10"
      id="cara-kerja"
    >
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[#1c1c1c] dark:text-surface-warm-white sm:text-4xl">
            Tiga langkah mudah
          </h2>
          <p className="mt-3 text-base text-[#5f5f5d] dark:text-surface-warm-white/60">
            Tanpa perlu paham koding. Ceritakan usahamu, kami yang siapkan
            sisanya.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
          {/* Step 1 */}
          <div className="flex flex-col rounded-2xl border border-black/10 bg-[#fcfbf8] p-8 shadow-sm transition-colors dark:border-white/10 dark:bg-[#1c1c1a] dark:shadow-none">
            <span className="font-mono text-2xl font-bold text-accent-orange">
              01
            </span>
            <h3 className="mt-4 text-lg font-bold tracking-tight text-[#1c1c1c] dark:text-surface-warm-white">
              Ceritakan usaha
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5f5f5d] dark:text-surface-warm-white/60">
              Tulis nama toko, menu atau jasa yang kamu tawarkan, serta kontak
              WhatsApp.
            </p>
          </div>

          {/* Step 2 */}
          <div className="flex flex-col rounded-2xl border border-black/10 bg-[#fcfbf8] p-8 shadow-sm transition-colors dark:border-white/10 dark:bg-[#1c1c1a] dark:shadow-none">
            <span className="font-mono text-2xl font-bold text-accent-orange">
              02
            </span>
            <h3 className="mt-4 text-lg font-bold tracking-tight text-[#1c1c1c] dark:text-surface-warm-white">
              AI bikin websitenya
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5f5f5d] dark:text-surface-warm-white/60">
              Dalam beberapa menit, teks penawaran, susunan menu, dan tombol
              order langsung siap.
            </p>
          </div>

          {/* Step 3 */}
          <div className="flex flex-col rounded-2xl border border-black/10 bg-[#fcfbf8] p-8 shadow-sm transition-colors dark:border-white/10 dark:bg-[#1c1c1a] dark:shadow-none">
            <span className="font-mono text-2xl font-bold text-accent-orange">
              03
            </span>
            <h3 className="mt-4 text-lg font-bold tracking-tight text-[#1c1c1c] dark:text-surface-warm-white">
              Bagikan ke pembeli
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5f5f5d] dark:text-surface-warm-white/60">
              Sebar link ke WhatsApp, bio Instagram, atau Google Maps agar
              pembeli bisa pesan langsung.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export const Route = createFileRoute("/_main/")({
  loader: async () => loadHome(),
  component: HomePage,
});

function HomePage() {
  const {
    greetingName,
    hasUser,
    initialNextCursor,
    initialProjects,
    initialWaitlistStatus,
    overProjectLimit: _overProjectLimit,
    projectCount: _projectCount,
    projectLimit: _projectLimit,
  } = Route.useLoaderData();

  const [promptFocused, setPromptFocused] = useState(false);
  const { status } = useSession();

  const waitlistQuery = useQuery({
    queryKey: queryKeys.waitlistStatus,
    queryFn: fetchWaitlistStatus,
    enabled: hasUser && status === "authenticated",
    initialData: initialWaitlistStatus ?? undefined,
    ...GATE_QUERY_OPTIONS,
    refetchInterval: (query) => waitlistPendingPollInterval(query.state.data),
  });

  const homeAccessState = resolveHomeAccessState({
    authStatus: status,
    hasUser,
    hasWaitlistData: Boolean(waitlistQuery.data),
    isApproved: waitlistQuery.data?.status === "approved",
    waitlistStatus: waitlistQuery.status,
  });

  const waitlisted = homeAccessState === "waitlisted";
  const ownEntry = waitlistQuery.data?.own ?? null;
  const ownStatus = ownEntry?.status ?? null;
  const waitlistBanner =
    ownStatus === "rejected"
      ? {
          body: "Pendaftaran kamu belum disetujui. Perbaiki data dan kirim ulang.",
          cta: "Perbaiki pendaftaran",
        }
      : ownStatus === "pending" || ownStatus === "waitlisted"
        ? {
            body: "Kamu masih dalam antrean. Kami hubungi lewat email.",
            cta: "Cek status antrean",
          }
        : {
            body: "Isi formulir antrean dulu biar kami bisa review usahamu.",
            cta: "Isi formulir antrean",
          };
  const siblingClass = promptFocused
    ? "transition-all duration-300 opacity-40 scale-[0.98]"
    : "transition-all duration-300";

  async function deleteProject(formData: FormData) {
    const projectId = formData.get("projectId");
    if (typeof projectId !== "string") {
      throw new Error("Unauthorized");
    }
    await deleteProjectFn({ data: { projectId } });
  }

  return (
    <div className="cursor-default bg-[#eceae4] text-[#1c1c1c] transition-colors duration-200 dark:bg-[#151515] dark:text-surface-warm-white">
      <ResetCursorOnMount />
      <section className="relative isolate flex min-h-[calc(100dvh-3.5rem)] flex-col justify-center overflow-hidden px-4 sm:px-spacing-9 lg:px-spacing-10">
        <HeroAuroraBackground />

        <HeroContentMotion>
          <HeroMotionItem className={siblingClass}>
            <h1
              id="hero-heading"
              className={`${hasUser || waitlisted ? "hero-block-in " : ""}max-w-4xl text-balance text-[clamp(3rem,6vw,5.4rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-[#1c1c1c] dark:text-surface-warm-white`}
            >
              {waitlisted ? (
                greetingName ? (
                  `Hai, ${greetingName}.`
                ) : (
                  "Kamu masih dalam antrean."
                )
              ) : hasUser ? (
                greetingName ? (
                  `Hai, ${greetingName}. Mau buat website apa hari ini?`
                ) : (
                  "Website apa yang mau kamu buat?"
                )
              ) : (
                <HeroHeadline />
              )}
            </h1>
            {waitlisted ? (
              <p className="mx-auto mt-spacing-4 max-w-2xl text-center text-base leading-7 text-[#5f5f5d] dark:text-surface-warm-white/62">
                Setelah disetujui, kamu bisa buat website di sini.
              </p>
            ) : null}
            {!waitlisted && !hasUser ? (
              <p className="mx-auto mt-spacing-7 max-w-2xl text-balance text-base leading-7 text-[#5f5f5d] dark:text-surface-warm-white/62 sm:text-lg">
                <HeroSubline />
              </p>
            ) : null}
          </HeroMotionItem>
          {waitlisted ? (
            <HeroMotionItem className="w-full">
              <div className="mx-auto mt-spacing-6 flex max-w-3xl flex-col items-center gap-spacing-3 rounded-[20px] border border-yellow-500/24 bg-yellow-500/[0.06] px-spacing-6 py-spacing-4 text-center text-sm text-[#1c1c1c] dark:text-surface-warm-white/82">
                <p>{waitlistBanner.body}</p>
                <Button asChild size="sm">
                  <Link href="/waitlist">{waitlistBanner.cta}</Link>
                </Button>
              </div>
            </HeroMotionItem>
          ) : (
            <HeroMotionItem
              className="hero-block-in w-full"
              style={{ "--block-delay": "0.15s" } as CSSProperties}
            >
              <HomePromptForm onFocusChange={setPromptFocused} />
            </HeroMotionItem>
          )}
        </HeroContentMotion>
      </section>

      {!hasUser ? (
        <>
          <CaraKerjaSection />
          <CommunitySection />
          <WhatsAppCommunityInvite variant="homepage" />
        </>
      ) : null}

      {hasUser && !waitlisted ? (
        <section className="bg-[#eceae4] px-4 pb-spacing-15 pt-spacing-12 text-[#1c1c1c] transition-colors duration-200 dark:bg-[#151515] dark:text-surface-warm-white sm:px-spacing-9 lg:px-spacing-10">
          <ScrollReveal>
            <div className="mx-auto max-w-6xl text-center sm:text-left">
              <div className="mx-auto max-w-2xl sm:mx-0">
                <h2 className="text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
                  Website kamu
                </h2>
                <p className="mt-spacing-4 text-sm leading-6 text-[#5f5f5d] dark:text-surface-warm-white/62 sm:text-base">
                  Lanjutkan website terakhir atau buka arsip pekerjaanmu.
                </p>
              </div>

              <ProjectList
                initialProjects={initialProjects}
                initialNextCursor={initialNextCursor}
                deleteProject={deleteProject}
              />
            </div>
          </ScrollReveal>
        </section>
      ) : null}
    </div>
  );
}

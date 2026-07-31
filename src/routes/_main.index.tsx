import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { motion } from "motion/react";
import { useState } from "react";

import {
  CommunitySection,
  getCommunityContributors,
} from "@/components/home/CommunitySection";
import { HeroAuroraBackground } from "@/components/home/HeroAuroraBackground";
import {
  HeroContentMotion,
  HeroMotionItem,
} from "@/components/home/HeroContentMotion";
import { ResetCursorOnMount } from "@/components/home/ResetCursorOnMount";
import { ScrollReveal } from "@/components/home/ScrollReveal";
import { HomePromptForm } from "@/components/projects/HomePromptForm";
import { ProjectList } from "@/components/projects/ProjectList";
import { Link } from "@/components/ui/link";
import { auth } from "@/lib/auth";
import { useSession } from "@/lib/auth-client";
import { prisma } from "@/lib/prisma";
import {
  encodeProjectCursor,
  PROJECT_PAGE_SIZE,
} from "@/lib/projects/pagination";
import { fetchJson, queryKeys } from "@/lib/query-client";
import {
  getProjectCount,
  getProjectLimit,
  isAtOrOverProjectLimit,
} from "@/lib/user-credits";

const loadHome = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth();
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
  // Contributor cards only render for logged-out visitors; fetch server-side so
  // the GitHub token stays on the server and the component can stay synchronous.
  const contributors = session?.user?.id
    ? []
    : await getCommunityContributors();

  return {
    contributors,
    greetingName,
    hasUser: Boolean(session?.user),
    initialNextCursor,
    initialProjects,
    overProjectLimit,
    projectCount,
    projectLimit,
  };
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

    // Gather artifact refs and deployment ids before the DB row is deleted,
    // then stop runtimes and delete every on-disk/R2 resource best-effort.
    // DB cascade removes snapshots/builds/deployments; resource cleanup must
    // run first while the refs are still queryable.
    if (project) {
      const [snapshots, builds, deployments, assets] = await Promise.all([
        prisma.projectSnapshot.findMany({
          where: { projectId },
          select: { sourceRef: true },
        }),
        prisma.projectBuild.findMany({
          where: { projectId },
          select: { artifactRef: true },
        }),
        prisma.projectDeployment.findMany({
          where: { projectId },
          select: { id: true },
        }),
        prisma.projectAsset.findMany({
          where: { projectId },
          select: { ref: true },
        }),
      ]);
      const artifactRefs = [
        ...snapshots.map((snapshot) => snapshot.sourceRef),
        ...builds.map((build) => build.artifactRef),
      ].filter((ref): ref is string => Boolean(ref));
      const assetRefs = assets
        .map((asset) => asset.ref)
        .filter((ref): ref is string => Boolean(ref));
      const { cleanupProjectResources } =
        await import("@/lib/projects/project-cleanup");
      const { getRuntimeSupervisor } =
        await import("@/lib/projects/runtime-supervisor");
      await cleanupProjectResources({
        projectId: project.id,
        artifactRefs,
        assetRefs,
        deploymentIds: deployments.map((deployment) => deployment.id),
        thumbnailRef: project.thumbnailRef,
        supervisor: getRuntimeSupervisor(),
      });
    }

    await prisma.project.deleteMany({
      where: {
        id: projectId,
        userId: session.user.id,
      },
    });
  });

const HERO_LEAD_WORDS = ["Bikin", "Website", "UMKM", "dalam", "5", "Menit,"];
const HERO_ACCENT = "100% Gratis.";

function HeroHeadline() {
  return (
    <span className="flex flex-wrap justify-center gap-x-[0.13em] gap-y-1">
      {HERO_LEAD_WORDS.map((word, i) => (
        <motion.span
          key={word}
          initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{
            opacity: { duration: 0.5, delay: 0.09 * i },
            y: { type: "spring", stiffness: 140, damping: 16, delay: 0.09 * i },
            filter: { duration: 0.4, delay: 0.09 * i },
          }}
        >
          {word}
        </motion.span>
      ))}
      <motion.span
        className="relative"
        initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{
          opacity: { duration: 0.5, delay: 0.09 * HERO_LEAD_WORDS.length },
          y: {
            type: "spring",
            stiffness: 140,
            damping: 16,
            delay: 0.09 * HERO_LEAD_WORDS.length,
          },
          filter: { duration: 0.4, delay: 0.09 * HERO_LEAD_WORDS.length },
        }}
      >
        {HERO_ACCENT}
        <motion.span
          aria-hidden
          className="absolute inset-x-0 -bottom-1 h-[5px] origin-left rounded-full bg-emerald-400"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{
            duration: 0.55,
            delay: 0.09 * HERO_LEAD_WORDS.length + 0.55,
            ease: "easeOut",
          }}
        />
      </motion.span>
    </span>
  );
}

export const Route = createFileRoute("/_main/")({
  loader: () => loadHome(),
  component: HomePage,
});

function HomePage() {
  const {
    contributors,
    greetingName,
    hasUser,
    initialNextCursor,
    initialProjects,
  } = Route.useLoaderData();
  const { status } = useSession();
  const waitlistQuery = useQuery({
    queryKey: queryKeys.waitlistStatus,
    queryFn: () =>
      fetchJson<{ status: string | null }>("/api/user/waitlist", {
        cache: "no-store",
      }),
    enabled: status === "authenticated",
    staleTime: 60_000,
  });
  const waitlisted =
    status === "authenticated" &&
    waitlistQuery.isSuccess &&
    waitlistQuery.data.status !== "approved";
  const [promptFocused, setPromptFocused] = useState(false);
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
    <div className="cursor-default bg-[#151515] text-surface-warm-white">
      <ResetCursorOnMount />
      <section className="relative isolate overflow-hidden px-4 py-spacing-14 sm:px-spacing-9 lg:px-spacing-10">
        <HeroAuroraBackground />

        <HeroContentMotion>
          <HeroMotionItem className={siblingClass}>
            <h1
              id="hero-heading"
              className="max-w-4xl text-balance text-[clamp(3rem,6vw,5.4rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-surface-warm-white"
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
              <p className="mt-spacing-4 max-w-2xl text-base leading-7 text-surface-warm-white/62">
                Setelah disetujui, kamu bisa buat website di sini.
              </p>
            ) : null}
          </HeroMotionItem>
          {waitlisted ? (
            <HeroMotionItem className="w-full">
              <div className="mx-auto mt-spacing-6 max-w-3xl rounded-[20px] border border-yellow-500/24 bg-yellow-500/[0.06] px-spacing-6 py-spacing-4 text-center text-sm text-surface-warm-white/82">
                <p>Kamu masih dalam antrean. Kami hubungi lewat email.</p>
                <Link
                  href="/waitlist"
                  className="mt-spacing-2 inline-block text-surface-warm-white underline-offset-4 hover:underline"
                >
                  Cek status antrean
                </Link>
              </div>
            </HeroMotionItem>
          ) : (
            <HeroMotionItem className="w-full">
              <HomePromptForm onFocusChange={setPromptFocused} />
            </HeroMotionItem>
          )}
        </HeroContentMotion>
      </section>

      {!hasUser ? <CommunitySection contributors={contributors} /> : null}

      {hasUser && !waitlisted ? (
        <section className="border-t border-surface-warm-white/10 bg-[#151515] px-4 pb-spacing-15 pt-spacing-12 text-surface-warm-white sm:px-spacing-9 lg:px-spacing-10">
          <ScrollReveal>
            <div className="mx-auto max-w-6xl text-left">
              <div className="max-w-2xl">
                <h2 className="text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
                  Website kamu
                </h2>
                <p className="mt-spacing-4 text-sm leading-6 text-surface-warm-white/62 sm:text-base">
                  Lanjutkan website terakhir atau buka arsip pekerjaanmu.
                </p>
              </div>

              <div className="mt-spacing-10">
                <ProjectList
                  initialProjects={initialProjects}
                  initialNextCursor={initialNextCursor}
                  deleteProject={deleteProject}
                />
              </div>
            </div>
          </ScrollReveal>
        </section>
      ) : null}
    </div>
  );
}

function getGreetingName(name?: string | null) {
  return name?.trim().split(/\s+/)[0]?.slice(0, 32) || "";
}

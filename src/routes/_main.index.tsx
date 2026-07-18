import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import {
  CommunitySection,
  getCommunityContributors,
} from "@/components/home/CommunitySection";
import { HeroAuroraBackground } from "@/components/home/HeroAuroraBackground";
import {
  HeroContentMotion,
  HeroMotionItem,
} from "@/components/home/HeroContentMotion";
import {
  ProjectsSectionSwitcher,
  type ProjectsSectionVariant,
} from "@/components/home/prototype/ProjectsSectionSwitcher";
import { ProjectsSectionVariants } from "@/components/home/prototype/ProjectsSectionVariants";
import { ResetCursorOnMount } from "@/components/home/ResetCursorOnMount";
import { HomePromptForm } from "@/components/projects/HomePromptForm";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  encodeProjectCursor,
  PROJECT_PAGE_SIZE,
} from "@/lib/projects/pagination";
import {
  getProjectCount,
  getProjectLimit,
  isOverProjectLimit,
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
  const overProjectLimit = isOverProjectLimit(projectCount, projectLimit);
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
      const [snapshots, builds, deployments] = await Promise.all([
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
      ]);
      const artifactRefs = [
        ...snapshots.map((snapshot) => snapshot.sourceRef),
        ...builds.map((build) => build.artifactRef),
      ].filter((ref): ref is string => Boolean(ref));
      const { cleanupProjectResources } =
        await import("@/lib/projects/project-cleanup");
      const { getRuntimeSupervisor } =
        await import("@/lib/projects/runtime-supervisor");
      await cleanupProjectResources({
        projectId: project.id,
        artifactRefs,
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

// PROTOTYPE: projects section via ?variant=A|B|C|D|E (A = current box).
const SECTION_KEYS = new Set(["A", "B", "C", "D", "E"]);

export const Route = createFileRoute("/_main/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    variant?: ProjectsSectionVariant;
  } => {
    const raw = typeof search.variant === "string" ? search.variant : undefined;
    if (!raw || !SECTION_KEYS.has(raw)) {
      return {};
    }
    return { variant: raw as ProjectsSectionVariant };
  },
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
  const search = Route.useSearch();
  const sectionVariant: ProjectsSectionVariant = search.variant ?? "A";

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
          <HeroMotionItem>
            <h1 className="max-w-4xl text-balance text-[clamp(3rem,6vw,5.4rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-surface-warm-white">
              {hasUser
                ? greetingName
                  ? `Hai, ${greetingName}. Mau buat website apa hari ini?`
                  : "Website apa yang mau kamu buat?"
                : "Usahamu layak punya website. 100% gratis."}
            </h1>
          </HeroMotionItem>
          <HeroMotionItem>
            <p className="mt-spacing-7 max-w-2xl text-balance text-lg leading-7 text-surface-warm-white/72 sm:text-xl">
              {hasUser
                ? "Tulis kebutuhan usahamu. AI bantu susun website yang cocok untuk pelangganmu."
                : "Tulis tentang usahamu. AI bantu buatkan website yang rapi, jelas, dan siap dibagikan."}
            </p>
          </HeroMotionItem>

          <HeroMotionItem className="w-full">
            <HomePromptForm />
          </HeroMotionItem>
        </HeroContentMotion>
      </section>

      {!hasUser ? <CommunitySection contributors={contributors} /> : null}

      {hasUser ? (
        <ProjectsSectionVariants
          variant={sectionVariant}
          initialProjects={initialProjects}
          initialNextCursor={initialNextCursor}
          deleteProject={deleteProject}
        />
      ) : null}

      {hasUser ? <ProjectsSectionSwitcher current={sectionVariant} /> : null}
    </div>
  );
}

function getGreetingName(name?: string | null) {
  return name?.trim().split(/\s+/)[0]?.slice(0, 32) || "";
}

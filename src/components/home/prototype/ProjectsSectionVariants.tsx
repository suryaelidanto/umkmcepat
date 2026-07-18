// PROTOTYPE throwaway — "Website kamu" section shells.
// A = production current. B–E explore chrome + list density (keep presence).

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { ProjectsSectionVariant } from "./ProjectsSectionSwitcher";

import { ScrollReveal } from "@/components/home/ScrollReveal";
import { createProjectMark } from "@/components/projects/project-mark";
import { ProjectList } from "@/components/projects/ProjectList";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Image } from "@/components/ui/image";
import { Link } from "@/components/ui/link";
import { useProjectLimit } from "@/lib/projects/use-project-limit";
import { fetchJson, queryKeys, useCacheMutation } from "@/lib/query-client";
import { cn } from "@/lib/utils";

type Project = {
  buildStatus?: string | null;
  id: string;
  thumbnailBuildId?: string | null;
  thumbnailRef?: string | null;
  title: string;
  updatedAt: Date | string;
};

type Props = {
  variant: ProjectsSectionVariant;
  initialProjects: Project[];
  initialNextCursor: string | null;
  deleteProject: (formData: FormData) => Promise<void>;
};

export function ProjectsSectionVariants(props: Props) {
  const { variant } = props;

  if (variant === "A") {
    return (
      <section className="bg-[#151515] px-4 pb-spacing-15 pt-spacing-12 text-surface-warm-white sm:px-spacing-9 lg:px-spacing-10">
        <ScrollReveal>
          <div className="mx-auto max-w-6xl text-left">
            <div className="rounded-radius-3xl border border-surface-warm-white/10 bg-[#1f1f1d] p-spacing-7 sm:p-spacing-10">
              <Header
                title="Website kamu"
                body="Lanjutkan website terakhir atau buka arsip pekerjaanmu."
              />
              <div className="mt-spacing-10">
                <ProjectList
                  initialProjects={props.initialProjects}
                  initialNextCursor={props.initialNextCursor}
                  deleteProject={props.deleteProject}
                />
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>
    );
  }

  if (variant === "B") {
    return (
      <section className="border-t border-surface-warm-white/10 bg-[#151515] px-4 pb-spacing-15 pt-spacing-12 text-surface-warm-white sm:px-spacing-9 lg:px-spacing-10">
        <ScrollReveal>
          <div className="mx-auto max-w-6xl text-left">
            <Header
              title="Website kamu"
              body="Lanjutkan website terakhir atau buka arsip pekerjaanmu."
            />
            <div className="mt-spacing-10">
              <ProjectList
                initialProjects={props.initialProjects}
                initialNextCursor={props.initialNextCursor}
                deleteProject={props.deleteProject}
              />
            </div>
          </div>
        </ScrollReveal>
      </section>
    );
  }

  if (variant === "C") {
    return (
      <section className="bg-[#151515] px-4 pb-spacing-15 pt-spacing-12 text-surface-warm-white sm:px-spacing-9 lg:px-spacing-10">
        <ScrollReveal>
          <div className="mx-auto max-w-6xl text-left">
            <div className="rounded-2xl border border-white/10 bg-[#1c1c1a] p-spacing-7 shadow-[0_24px_48px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.05] sm:p-spacing-10">
              <Header
                title="Website kamu"
                body="Lanjutkan website terakhir atau buka arsip pekerjaanmu."
              />
              <div className="mt-spacing-10">
                <ProjectList
                  initialProjects={props.initialProjects}
                  initialNextCursor={props.initialNextCursor}
                  deleteProject={props.deleteProject}
                />
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>
    );
  }

  if (variant === "D") {
    return (
      <section className="border-t border-surface-warm-white/10 bg-[#151515] px-4 pb-spacing-15 pt-spacing-12 text-surface-warm-white sm:px-spacing-9 lg:px-spacing-10">
        <ScrollReveal>
          <div className="mx-auto max-w-5xl text-left">
            <Header
              title="Website kamu"
              body="Lanjutkan atau hapus yang tidak terpakai."
              compact
            />
            <div className="mt-8">
              <DenseRowsList {...props} />
            </div>
          </div>
        </ScrollReveal>
      </section>
    );
  }

  return (
    <section className="border-t border-surface-warm-white/10 bg-[#151515] px-4 pb-spacing-15 pt-spacing-12 text-surface-warm-white sm:px-spacing-9 lg:px-spacing-10">
      <ScrollReveal>
        <div className="mx-auto max-w-6xl text-left">
          <Header
            title="Website kamu"
            body="Arsip pekerjaan — buka atau hapus."
            compact
          />
          <div className="mt-8">
            <IndexTableList {...props} />
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}

function Header({
  title,
  body,
  compact,
}: {
  title: string;
  body: string;
  compact?: boolean;
}) {
  return (
    <div className="max-w-2xl">
      <h2
        className={
          compact
            ? "text-2xl font-semibold tracking-[-0.04em] sm:text-3xl"
            : "text-3xl font-semibold tracking-[-0.05em] sm:text-4xl"
        }
      >
        {title}
      </h2>
      <p
        className={
          compact
            ? "mt-2 text-sm leading-6 text-surface-warm-white/55"
            : "mt-spacing-4 text-sm leading-6 text-surface-warm-white/62 sm:text-base"
        }
      >
        {body}
      </p>
    </div>
  );
}

/** D — dense rows with large thumb (presence without nested outer fill). */
function DenseRowsList({
  initialProjects,
  initialNextCursor,
  deleteProject,
}: Omit<Props, "variant">) {
  const state = useProjectsState({
    initialProjects,
    initialNextCursor,
    deleteProject,
  });

  if (!state.projects.length) {
    return <EmptyArchive />;
  }

  return (
    <>
      {state.overLimitBanner}
      <ul className="divide-y divide-surface-warm-white/10 border-y border-surface-warm-white/10">
        {state.projects.map((project) => (
          <li key={project.id}>
            <div className="group flex items-center gap-4 py-4 transition-colors hover:bg-surface-warm-white/[0.03] sm:gap-5">
              <Thumb
                project={project}
                className="size-20 shrink-0 rounded-xl sm:size-24"
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/projects/${project.id}`}
                  className="block truncate text-base font-semibold tracking-[-0.025em] text-surface-warm-white outline-none hover:underline focus-visible:ring-2 focus-visible:ring-surface-warm-white sm:text-lg"
                >
                  {project.title}
                </Link>
                <p className="mt-1 text-sm text-surface-warm-white/50">
                  Diubah {formatDate(project.updatedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="rounded-radius-lg border-surface-warm-white/12 bg-surface-warm-white/8 text-surface-warm-white hover:bg-surface-warm-white/12"
                >
                  <Link href={`/projects/${project.id}`}>Buka</Link>
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => state.setSelectedProject(project)}
                  className="rounded-radius-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Hapus
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {state.loadMore}
      {state.deleteDialog}
    </>
  );
}

/** E — index table, hairlines, real buttons. */
function IndexTableList({
  initialProjects,
  initialNextCursor,
  deleteProject,
}: Omit<Props, "variant">) {
  const state = useProjectsState({
    initialProjects,
    initialNextCursor,
    deleteProject,
  });

  if (!state.projects.length) {
    return <EmptyArchive />;
  }

  return (
    <>
      {state.overLimitBanner}
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-surface-warm-white/12 text-xs uppercase tracking-[0.08em] text-surface-warm-white/45">
              <th className="pb-3 pr-4 font-medium">Website</th>
              <th className="pb-3 pr-4 font-medium">Diubah</th>
              <th className="pb-3 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {state.projects.map((project) => (
              <tr
                key={project.id}
                className="border-b border-surface-warm-white/[0.08] transition-colors hover:bg-surface-warm-white/[0.03]"
              >
                <td className="py-4 pr-4">
                  <div className="flex items-center gap-3">
                    <Thumb
                      project={project}
                      className="size-12 shrink-0 rounded-lg"
                    />
                    <Link
                      href={`/projects/${project.id}`}
                      className="font-medium tracking-[-0.02em] text-surface-warm-white outline-none hover:underline focus-visible:ring-2 focus-visible:ring-surface-warm-white"
                    >
                      {project.title}
                    </Link>
                  </div>
                </td>
                <td className="py-4 pr-4 text-sm tabular-nums text-surface-warm-white/50">
                  {formatDate(project.updatedAt)}
                </td>
                <td className="py-4 text-right">
                  <div className="inline-flex items-center gap-2">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="rounded-radius-lg border-surface-warm-white/12 bg-surface-warm-white/8 text-surface-warm-white hover:bg-surface-warm-white/12"
                    >
                      <Link href={`/projects/${project.id}`}>Buka</Link>
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => state.setSelectedProject(project)}
                      className="rounded-radius-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Hapus
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {state.loadMore}
      {state.deleteDialog}
    </>
  );
}

function useProjectsState({
  initialProjects,
  initialNextCursor,
  deleteProject,
}: Omit<Props, "variant">) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const { count, limit, overLimit } = useProjectLimit();

  const projectsQuery = useInfiniteQuery({
    queryKey: queryKeys.projects,
    queryFn: async ({ pageParam }) => {
      const path = pageParam
        ? `/api/projects?cursor=${encodeURIComponent(pageParam)}`
        : "/api/projects";
      return fetchJson<{ projects: Project[]; nextCursor: string | null }>(
        path,
        { cache: "no-store" },
      );
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialData: {
      pages: [{ projects: initialProjects, nextCursor: initialNextCursor }],
      pageParams: [null],
    },
    initialDataUpdatedAt: 0,
    staleTime: 0,
  });

  const deleteMutation = useCacheMutation<string, string>({
    mutationFn: async (projectId) => {
      const formData = new FormData();
      formData.set("projectId", projectId);
      await deleteProject(formData);
      return projectId;
    },
    optimisticPatches: [
      {
        queryKey: queryKeys.projects,
        updater: (previous, projectId) => {
          const data = previous as
            | {
                pages: Array<{ projects: Project[] }>;
                pageParams: unknown[];
              }
            | undefined;
          if (!data) {
            return data;
          }
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              projects: page.projects.filter((p) => p.id !== projectId),
            })),
          };
        },
      },
    ],
    invalidateKeys: [queryKeys.projects],
    successMessage: "Website dihapus.",
    errorMessage: "Website belum berhasil dihapus.",
    onSuccess: () => setSelectedProject(null),
  });

  const projects =
    projectsQuery.data?.pages.flatMap((page) => page.projects) ??
    initialProjects;
  const isLoadingMore = projectsQuery.isFetchingNextPage;
  const isPending = deleteMutation.isPending;

  const overLimitBanner = overLimit ? (
    <p className="mb-6 text-sm leading-6 text-yellow-200/90">
      {count} website (batas {limit}). Hapus yang tidak terpakai agar mudah
      dikelola.
    </p>
  ) : null;

  const loadMore = projectsQuery.hasNextPage ? (
    <div className="mt-spacing-8 flex justify-center">
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          void projectsQuery.fetchNextPage().catch(() => {
            toast.error("Gagal memuat website lain. Coba lagi.");
          });
        }}
        disabled={isLoadingMore}
        className="rounded-radius-lg border-surface-warm-white/14 bg-surface-warm-white/8 text-surface-warm-white hover:bg-surface-warm-white/12"
      >
        {isLoadingMore ? "Memuat..." : "Muat lebih banyak"}
      </Button>
    </div>
  ) : null;

  const deleteDialog = (
    <Dialog
      open={Boolean(selectedProject)}
      onOpenChange={(open) => {
        if (!open && !isPending) {
          setSelectedProject(null);
        }
      }}
    >
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>Hapus website?</DialogTitle>
          <DialogDescription>
            Website ini akan dihapus permanen dan tidak bisa dikembalikan.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-spacing-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setSelectedProject(null)}
            disabled={isPending}
          >
            Batal
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (selectedProject && !isPending) {
                deleteMutation.mutate(selectedProject.id);
              }
            }}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Menghapus..." : "Hapus"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return {
    projects,
    setSelectedProject,
    overLimitBanner,
    loadMore,
    deleteDialog,
  };
}

function EmptyArchive() {
  return (
    <div className="rounded-radius-2xl border border-dashed border-surface-warm-white/16 bg-surface-warm-white/[0.06] p-spacing-10 text-center">
      <h3 className="text-xl font-semibold tracking-[-0.04em]">
        Belum ada website
      </h3>
      <p className="mx-auto mt-spacing-4 max-w-md text-sm leading-6 text-surface-warm-white/58">
        Tulis kebutuhan usahamu di atas. Website barumu akan muncul di sini.
      </p>
    </div>
  );
}

function Thumb({
  project,
  className = "",
}: {
  project: Project;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!project.thumbnailRef || !project.thumbnailBuildId || failed) {
    return <ProjectMark seed={project.id} className={className} />;
  }
  return (
    <Link
      href={`/projects/${project.id}`}
      className={cn("relative block overflow-hidden bg-[#10100f]", className)}
      aria-label={`Buka ${project.title}`}
    >
      <Image
        src={`/api/projects/${project.id}/thumbnail?v=${encodeURIComponent(project.thumbnailBuildId)}`}
        alt=""
        fill
        unoptimized
        sizes="96px"
        onError={() => setFailed(true)}
        className="object-cover object-top opacity-95"
      />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-surface-warm-white/10" />
    </Link>
  );
}

function ProjectMark({
  seed,
  className = "",
}: {
  seed: string;
  className?: string;
}) {
  const mark = useMemo(() => createProjectMark(seed), [seed]);
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ backgroundColor: mark.base }}
      aria-hidden
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(${mark.angle}deg, ${mark.from} 0%, ${mark.to} 100%)`,
          opacity: 0.4,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(circle at ${mark.glowX}% ${mark.glowY}%, ${mark.glowColor} 0%, transparent 52%)`,
          opacity: 0.32,
        }}
      />
    </div>
  );
}

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

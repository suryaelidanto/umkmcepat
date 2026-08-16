"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { createProjectMark } from "./project-mark";

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
type Project = {
  buildStatus?: string | null;
  id: string;
  thumbnailBuildId?: string | null;
  thumbnailRef?: string | null;
  title: string;
  updatedAt: Date | string;
};

type ProjectListProps = {
  initialProjects: Project[];
  initialNextCursor: string | null;
  deleteProject: (formData: FormData) => Promise<void>;
};

type ProjectsPage = {
  projects: Project[];
  nextCursor: string | null;
};

export function ProjectList({
  initialProjects,
  initialNextCursor,
  deleteProject,
}: ProjectListProps) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const { count, limit, overLimit } = useProjectLimit();
  const queryClient = useQueryClient();

  async function fetchProjectsPage(pageParam: string | null) {
    const path = pageParam
      ? `/api/projects?cursor=${encodeURIComponent(pageParam)}`
      : "/api/projects";
    return fetchJson<ProjectsPage>(path, { cache: "no-store" });
  }

  const projectsQuery = useInfiniteQuery({
    queryKey: queryKeys.projects,
    queryFn: ({ pageParam }) => fetchProjectsPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // Seed cache once from the route loader. Always refetch page 0 from API
    // afterwards so deletes/creates don't get overwritten by stale loader data.
    initialData: {
      pages: [
        {
          projects: initialProjects,
          nextCursor: initialNextCursor,
        },
      ],
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
                pages: Array<{
                  projectCount?: number;
                  projectLimit?: number;
                  overProjectLimit?: boolean;
                  projects: Project[];
                }>;
                pageParams: unknown[];
              }
            | undefined;

          if (!data) {
            return data;
          }

          return {
            ...data,
            pages: data.pages.map((page) => {
              if (page.projectCount === undefined) {
                return {
                  ...page,
                  projects: page.projects.filter((p) => p.id !== projectId),
                };
              }
              const nextCount = Math.max(0, page.projectCount - 1);
              const limitForPage = page.projectLimit ?? nextCount;
              return {
                ...page,
                overProjectLimit: nextCount >= limitForPage,
                projectCount: nextCount,
                projects: page.projects.filter((p) => p.id !== projectId),
              };
            }),
          };
        },
      },
    ],
    invalidateKeys: [queryKeys.projects, queryKeys.energy],
    successMessage: "Website berhasil dihapus.",
    errorMessage: "Gagal menghapus website.",
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });

  const projects = useMemo(
    () => projectsQuery.data?.pages.flatMap((page) => page.projects) ?? [],
    [projectsQuery.data],
  );

  async function handleDelete() {
    if (!selectedProject) {
      return;
    }
    const projectId = selectedProject.id;
    setSelectedProject(null);
    try {
      await deleteMutation.mutateAsync(projectId);
    } catch {
      // Handled by toast in useCacheMutation
    }
  }

  const isPending = deleteMutation.isPending;

  if (projects.length === 0) {
    return (
      <div className="mt-spacing-8 rounded-radius-2xl border border-black/10 bg-black/[0.02] p-spacing-9 text-center text-[#5f5f5d] transition-colors duration-200 dark:border-surface-warm-white/10 dark:bg-surface-warm-white/[0.04] dark:text-surface-warm-white/60 sm:p-spacing-11">
        <p className="text-base">Belum ada website yang dibuat.</p>
        <p className="mt-spacing-2 text-sm text-[#5f5f5d] dark:text-surface-warm-white/44">
          Tulis cerita usahamu di atas untuk mulai membuat website pertama.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-spacing-8 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#5f5f5d] dark:text-surface-warm-white/50">
          Total: {count}/{limit} Website
        </span>
        {overLimit ? (
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            Batas tercapai — hapus website lama untuk buat baru
          </span>
        ) : null}
      </div>

      <div className="mt-spacing-5 grid grid-cols-1 gap-spacing-6 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onDelete={(p) => setSelectedProject(p)}
          />
        ))}
      </div>

      {projectsQuery.hasNextPage ? (
        <div className="mt-spacing-9 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => void projectsQuery.fetchNextPage()}
            disabled={projectsQuery.isFetchingNextPage}
            className="rounded-radius-lg border-black/15 bg-black/[0.04] text-[#1c1c1c] hover:bg-black/[0.08] dark:border-surface-warm-white/15 dark:bg-surface-warm-white/5 dark:text-surface-warm-white dark:hover:bg-surface-warm-white/10"
          >
            {projectsQuery.isFetchingNextPage
              ? "Memuat..."
              : "Muat lebih banyak"}
          </Button>
        </div>
      ) : null}

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
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? "Menghapus..." : "Hapus"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProjectCard({
  project,
  onDelete,
}: {
  project: Project;
  onDelete: (project: Project) => void;
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-radius-2xl border border-black/10 bg-[#fcfbf8] shadow-sm transition-colors duration-200 hover:bg-[#f7f4ed] dark:border-surface-warm-white/10 dark:bg-surface-warm-white/[0.045] dark:shadow-none dark:hover:bg-surface-warm-white/[0.06]">
      <ProjectPreviewThumb project={project} className="h-40 sm:h-44" />
      <div className="flex min-h-36 flex-1 flex-col p-spacing-5">
        <h3 className="line-clamp-2 text-base font-semibold tracking-[-0.035em] text-[#1c1c1c] dark:text-surface-warm-white">
          <Link
            href={`/projects/${project.id}`}
            className="rounded-radius-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-black/50 dark:focus-visible:ring-surface-warm-white"
          >
            {project.title}
          </Link>
        </h3>
        <p className="mt-spacing-2 text-sm text-[#5f5f5d] dark:text-surface-warm-white/54">
          Diubah {formatDate(project.updatedAt)}
        </p>
        <div className="mt-auto flex items-center gap-spacing-3 pt-spacing-5">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-radius-lg border-black/15 bg-black/[0.04] text-[#1c1c1c] hover:bg-black/[0.08] dark:border-surface-warm-white/12 dark:bg-surface-warm-white/8 dark:text-surface-warm-white dark:hover:bg-surface-warm-white/12"
          >
            <Link href={`/projects/${project.id}`}>Buka</Link>
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => onDelete(project)}
            className="rounded-radius-lg bg-destructive/10 text-destructive hover:bg-destructive/20"
          >
            Hapus
          </Button>
        </div>
      </div>
    </article>
  );
}

function ProjectPreviewThumb({
  project,
  className,
}: {
  project: Project;
  className?: string;
}) {
  const mark = useMemo(() => createProjectMark(project.title), [project.title]);

  if (project.thumbnailRef) {
    return (
      <div
        className={`relative w-full overflow-hidden bg-black/[0.04] dark:bg-[#121211] ${className ?? ""}`}
      >
        <Image
          src={`/media/${project.thumbnailRef}`}
          alt={project.title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative flex w-full items-center justify-center p-6 text-center overflow-hidden ${className ?? ""}`}
      style={{
        background: `radial-gradient(circle at ${mark.glowX}% ${mark.glowY}%, ${mark.glowColor} 0%, transparent 60%), linear-gradient(${mark.angle}deg, ${mark.from} 0%, ${mark.to} 100%)`,
      }}
    >
      <div className="flex max-w-[85%] items-center justify-center rounded-xl bg-black/25 px-4 py-2 text-center font-sans text-sm font-bold tracking-tight text-white backdrop-blur-md shadow-md line-clamp-2">
        {project.title}
      </div>
    </div>
  );
}

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

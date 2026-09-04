"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { createProjectMark } from "./project-mark";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardTitle,
} from "@/components/ui/card";
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
  thumbnailUpdatedAt?: Date | string | null;
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
      <Card
        variant="muted"
        className="mt-spacing-8 p-spacing-9 text-center sm:p-spacing-11"
      >
        <CardContent className="p-0">
          <p className="text-base text-muted-foreground">
            Belum ada website yang dibuat.
          </p>
          <p className="mt-spacing-2 text-sm text-muted-foreground/70">
            Tulis cerita usahamu di atas untuk mulai membuat website pertama.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="mt-spacing-8 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Total: {count}/{limit} Website
        </span>
        {overLimit ? (
          <span className="text-xs font-medium text-status-warning">
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
            className="rounded-radius-lg border-border bg-card text-foreground hover:bg-muted"
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
              variant="destructive"
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
    <Card
      as="article"
      interactive
      className="group relative flex flex-col overflow-hidden p-0"
    >
      <Link
        href={`/projects/${project.id}`}
        className="block overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={`Buka website ${project.title}`}
      >
        <ProjectPreviewThumb
          project={project}
          className="h-36 transition-transform duration-300 group-hover:scale-[1.02] sm:h-44"
        />
      </Link>
      <CardContent className="flex flex-1 flex-col p-4 sm:p-5">
        <CardTitle className="line-clamp-1 text-base font-semibold tracking-tight">
          <Link
            href={`/projects/${project.id}`}
            className="rounded-radius-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary"
          >
            {project.title}
          </Link>
        </CardTitle>
        <CardDescription className="mt-1 text-xs">
          Diubah {formatDate(project.updatedAt)}
        </CardDescription>
        <CardFooter className="mt-4 grid grid-cols-2 gap-2 border-t border-border/50 p-0 pt-3">
          <Button
            asChild
            size="sm"
            className="h-8 w-full rounded-lg text-xs font-semibold shadow-xs"
          >
            <Link href={`/projects/${project.id}`}>Buka</Link>
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => onDelete(project)}
            className="h-8 w-full rounded-lg text-xs font-semibold shadow-xs"
          >
            Hapus
          </Button>
        </CardFooter>
      </CardContent>
    </Card>
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
  const version = project.thumbnailUpdatedAt
    ? new Date(project.thumbnailUpdatedAt).getTime()
    : new Date(project.updatedAt).getTime();

  if (project.thumbnailRef) {
    return (
      <div
        className={`relative w-full overflow-hidden bg-black/[0.04] dark:bg-[#121211] ${className ?? ""}`}
      >
        <Image
          src={`/api/projects/${project.id}/thumbnail?v=${version}`}
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
    />
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

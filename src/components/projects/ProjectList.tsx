"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { createProjectMark } from "./project-mark";

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
  projectCount?: number;
  projectLimit?: number;
  overProjectLimit?: boolean;
};

export function ProjectList({
  initialProjects,
  initialNextCursor,
  deleteProject,
  projectCount,
  projectLimit,
  overProjectLimit,
}: ProjectListProps) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialNextCursor,
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function loadMore() {
    if (!nextCursor || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);

    try {
      const response = await fetch(
        `/api/projects?cursor=${encodeURIComponent(nextCursor)}`,
      );

      if (!response.ok) {
        throw new Error("failed");
      }

      const data = (await response.json()) as {
        projects: Project[];
        nextCursor: string | null;
      };
      setProjects((current) => [...current, ...data.projects]);
      setNextCursor(data.nextCursor);
    } catch {
      toast.error("Gagal memuat website lain. Coba lagi.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  function handleDelete() {
    if (!selectedProject) {
      return;
    }

    const targetId = selectedProject.id;
    const formData = new FormData();
    formData.set("projectId", targetId);

    startTransition(async () => {
      try {
        await deleteProject(formData);

        setProjects((current) =>
          current.filter((project) => project.id !== targetId),
        );

        toast.success("Website dihapus.");
        setSelectedProject(null);
      } catch {
        toast.error("Website belum berhasil dihapus.");
      }
    });
  }

  if (!projects.length) {
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

  return (
    <>
      {overProjectLimit &&
      typeof projectCount === "number" &&
      typeof projectLimit === "number" ? (
        <div className="mb-spacing-6 flex items-start gap-spacing-3 rounded-radius-xl border border-yellow-500/24 bg-yellow-500/[0.06] px-spacing-5 py-spacing-4">
          <span className="mt-0.5 text-yellow-400" aria-hidden>
            ⚠️
          </span>
          <div className="text-sm leading-6 text-surface-warm-white/78">
            Kamu punya{" "}
            <strong className="font-semibold text-surface-warm-white">
              {projectCount} website
            </strong>
            , melebihi batas {projectLimit}. Kamu masih bisa menggunakannya
            semua, tapi sebaiknya hapus yang tidak terpakai agar mudah dikelola.
          </div>
        </div>
      ) : null}
      <div className="grid gap-spacing-5 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onDelete={setSelectedProject}
          />
        ))}
      </div>

      {nextCursor ? (
        <div className="mt-spacing-8 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={loadMore}
            disabled={isLoadingMore}
            className="rounded-radius-lg border-surface-warm-white/14 bg-surface-warm-white/8 text-surface-warm-white hover:bg-surface-warm-white/12"
          >
            {isLoadingMore ? "Memuat..." : "Muat lebih banyak"}
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
    <article className="group flex flex-col overflow-hidden rounded-radius-2xl border border-surface-warm-white/10 bg-surface-warm-white/[0.045] transition hover:bg-surface-warm-white/[0.06]">
      <ProjectPreviewThumb project={project} className="h-40 sm:h-44" />
      <div className="flex min-h-36 flex-1 flex-col p-spacing-5">
        <h3 className="line-clamp-2 text-base font-semibold tracking-[-0.035em] text-surface-warm-white">
          <Link
            href={`/projects/${project.id}`}
            className="rounded-radius-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-surface-warm-white"
          >
            {project.title}
          </Link>
        </h3>
        <p className="mt-spacing-2 text-sm text-surface-warm-white/54">
          Diubah {formatDate(project.updatedAt)}
        </p>
        <div className="mt-auto flex items-center gap-spacing-3 pt-spacing-5">
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
            onClick={() => onDelete(project)}
            className="rounded-radius-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Hapus
          </Button>
        </div>
      </div>
    </article>
  );
}

function ProjectPreviewThumb({
  className = "",
  project,
}: {
  className?: string;
  project: Project;
}) {
  const [failed, setFailed] = useState(false);

  if (!project.thumbnailRef || !project.thumbnailBuildId || failed) {
    return <ProjectMark seed={project.id} className={className} />;
  }

  return (
    <Link
      href={`/projects/${project.id}`}
      className={`group relative block overflow-hidden bg-[#10100f] ${className}`}
      aria-label={`Buka ${project.title}`}
    >
      <Image
        src={`/api/projects/${project.id}/thumbnail?v=${encodeURIComponent(project.thumbnailBuildId)}`}
        alt=""
        fill
        unoptimized
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        onError={() => setFailed(true)}
        className="object-cover object-top opacity-95 transition duration-300 group-hover:opacity-100"
      />
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-surface-warm-white/10" />
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
      className={`relative overflow-hidden ${className}`}
      style={{ backgroundColor: mark.base }}
      aria-hidden="true"
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
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />
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

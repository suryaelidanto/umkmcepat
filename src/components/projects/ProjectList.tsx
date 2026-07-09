"use client";

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
  title: string;
  updatedAt: Date | string;
};

type ProjectListProps = {
  featured: Project;
  initialOthers: Project[];
  initialNextCursor: string | null;
  deleteProject: (formData: FormData) => Promise<void>;
};

export function ProjectList({
  featured: initialFeatured,
  initialOthers,
  initialNextCursor,
  deleteProject,
}: ProjectListProps) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [featured, setFeatured] = useState<Project | null>(initialFeatured);
  const [others, setOthers] = useState<Project[]>(initialOthers);
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
      setOthers((current) => [...current, ...data.projects]);
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
    const isDeletingFeatured = featured?.id === targetId;
    const promotedProject = isDeletingFeatured ? (others[0] ?? null) : null;
    const formData = new FormData();
    formData.set("projectId", targetId);

    startTransition(async () => {
      try {
        await deleteProject(formData);

        if (isDeletingFeatured) {
          setFeatured(promotedProject);
        }

        setOthers((current) =>
          current.filter(
            (project) =>
              project.id !== targetId && project.id !== promotedProject?.id,
          ),
        );

        toast.success("Website dihapus.");
        setSelectedProject(null);
      } catch {
        toast.error("Website belum berhasil dihapus.");
      }
    });
  }

  const totalCount = (featured ? 1 : 0) + others.length;

  if (!featured) {
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
      <div className="space-y-spacing-8">
        <FeaturedProject project={featured} onDelete={setSelectedProject} />

        <section className="rounded-radius-3xl border border-surface-warm-white/10 bg-surface-warm-white/[0.045] px-spacing-6 py-spacing-6 sm:px-spacing-8 sm:py-spacing-7">
          <div className="flex flex-wrap items-end justify-between gap-spacing-5 pb-spacing-5">
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.04em] text-surface-warm-white">
                Website lain
              </h3>
              <p className="mt-spacing-1 text-sm text-surface-warm-white/56">
                {others.length
                  ? `${totalCount} website tersimpan`
                  : "Belum ada website lain"}
              </p>
            </div>
          </div>

          {others.length ? (
            <div className="grid gap-spacing-3">
              {others.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  onDelete={setSelectedProject}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-radius-2xl border border-dashed border-surface-warm-white/10 px-spacing-6 py-spacing-8 text-sm leading-6 text-surface-warm-white/56">
              Website berikutnya yang kamu buat akan muncul di sini.
            </p>
          )}

          {nextCursor && others.length > 0 ? (
            <div className="mt-spacing-6 flex justify-center">
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
        </section>
      </div>

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

function FeaturedProject({
  project,
  onDelete,
}: {
  project: Project;
  onDelete: (project: Project) => void;
}) {
  return (
    <article className="overflow-hidden rounded-radius-3xl border border-surface-warm-white/10 bg-surface-warm-white/[0.055]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,0.62fr)_minmax(0,1fr)]">
        <ProjectPreviewThumb
          project={project}
          className="min-h-44 lg:min-h-full"
        />
        <div className="flex min-h-72 flex-col p-spacing-8 sm:p-spacing-10 lg:p-spacing-11">
          <p className="text-sm text-surface-warm-white/58">
            Terakhir dikerjakan
          </p>
          <h3 className="mt-spacing-5 max-w-2xl text-balance text-[clamp(2rem,4vw,4.2rem)] font-semibold leading-[0.98] tracking-[-0.065em] text-surface-warm-white">
            <Link
              href={`/projects/${project.id}`}
              className="rounded-radius-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-surface-warm-white"
            >
              {project.title}
            </Link>
          </h3>
          <p className="mt-spacing-7 text-sm text-surface-warm-white/58">
            Diubah {formatDate(project.updatedAt)}
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-spacing-4 pt-spacing-10">
            <Button
              asChild
              className="rounded-radius-lg bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/90"
            >
              <Link href={`/projects/${project.id}`}>Buka</Link>
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => onDelete(project)}
              className="rounded-radius-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Hapus
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function ProjectRow({
  project,
  onDelete,
}: {
  project: Project;
  onDelete: (project: Project) => void;
}) {
  return (
    <div className="group grid grid-cols-[52px_1fr] gap-spacing-5 rounded-radius-2xl px-spacing-4 py-spacing-4 transition-colors hover:bg-surface-warm-white/[0.055] sm:grid-cols-[60px_1fr_auto] sm:items-center sm:px-spacing-5">
      <ProjectPreviewThumb
        project={project}
        className="h-14 rounded-radius-xl sm:h-16"
      />
      <div className="min-w-0">
        <Link
          href={`/projects/${project.id}`}
          className="line-clamp-1 text-base font-semibold tracking-[-0.035em] text-surface-warm-white outline-none hover:underline focus-visible:ring-2 focus-visible:ring-surface-warm-white"
        >
          {project.title}
        </Link>
        <p className="mt-spacing-2 text-sm text-surface-warm-white/54">
          Diubah {formatDate(project.updatedAt)}
        </p>
      </div>
      <div className="col-span-2 grid grid-cols-2 gap-spacing-3 sm:col-span-1 sm:col-start-auto sm:flex sm:items-center">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="w-full rounded-radius-lg border-surface-warm-white/12 bg-surface-warm-white/8 text-surface-warm-white hover:bg-surface-warm-white/12 sm:w-auto"
        >
          <Link href={`/projects/${project.id}`}>Buka</Link>
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => onDelete(project)}
          className="w-full rounded-radius-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:w-auto"
        >
          Hapus
        </Button>
      </div>
    </div>
  );
}

function ProjectPreviewThumb({
  className = "",
  project,
}: {
  className?: string;
  project: Project;
}) {
  const canPreview = ["ready", "succeeded", "passed"].includes(
    project.buildStatus ?? "",
  );

  if (!canPreview) {
    return <ProjectMark seed={project.id} className={className} />;
  }

  return (
    <Link
      href={`/projects/${project.id}`}
      className={`group relative block overflow-hidden bg-[#10100f] ${className}`}
      aria-label={`Buka ${project.title}`}
    >
      <iframe
        title={`Cuplikan ${project.title}`}
        src={`/api/projects/${project.id}/preview/?thumb=1`}
        sandbox="allow-scripts"
        loading="lazy"
        tabIndex={-1}
        className="pointer-events-none h-[400%] w-[400%] origin-top-left scale-25 border-0 bg-white opacity-95 transition duration-300 group-hover:opacity-100"
      />
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-surface-warm-white/10" />
      <div className="pointer-events-none absolute bottom-spacing-3 left-spacing-3 rounded-full border border-surface-warm-white/12 bg-[#151515]/82 px-spacing-3 py-spacing-2 text-xs font-medium text-surface-warm-white/78 backdrop-blur">
        Preview
      </div>
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

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
  id: string;
  title: string;
  updatedAt: Date;
};

type ProjectListProps = {
  projects: Project[];
  deleteProject: (formData: FormData) => Promise<void>;
};

export function ProjectList({ projects, deleteProject }: ProjectListProps) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [latestProject, ...otherProjects] = projects;
  const visibleOtherProjects = showAll
    ? otherProjects
    : otherProjects.slice(0, 5);
  const hiddenProjectCount = Math.max(
    otherProjects.length - visibleOtherProjects.length,
    0,
  );

  function handleDelete() {
    if (!selectedProject) {
      return;
    }

    const formData = new FormData();
    formData.set("projectId", selectedProject.id);

    startTransition(async () => {
      try {
        await deleteProject(formData);
        toast.success("Website dihapus.");
        setSelectedProject(null);
      } catch {
        toast.error("Website belum berhasil dihapus.");
      }
    });
  }

  if (!latestProject) {
    return null;
  }

  return (
    <>
      <div className="space-y-spacing-8">
        <FeaturedProject
          project={latestProject}
          onDelete={setSelectedProject}
        />

        <section className="rounded-radius-3xl border border-surface-warm-white/10 bg-surface-warm-white/[0.045] px-spacing-6 py-spacing-6 sm:px-spacing-8 sm:py-spacing-7">
          <div className="flex flex-wrap items-end justify-between gap-spacing-5 pb-spacing-5">
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.04em] text-surface-warm-white">
                Website lain
              </h3>
              <p className="mt-spacing-1 text-sm text-surface-warm-white/56">
                {otherProjects.length
                  ? `${otherProjects.length} website tersimpan`
                  : "Belum ada website lain"}
              </p>
            </div>

            {hiddenProjectCount ? (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="rounded-radius-lg px-spacing-4 py-spacing-2 text-sm font-medium text-surface-warm-white/76 hover:bg-surface-warm-white/8 hover:text-surface-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-warm-white"
              >
                Lihat lainnya
              </button>
            ) : showAll && otherProjects.length > 5 ? (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="rounded-radius-lg px-spacing-4 py-spacing-2 text-sm font-medium text-surface-warm-white/76 hover:bg-surface-warm-white/8 hover:text-surface-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-warm-white"
              >
                Ringkas daftar
              </button>
            ) : null}
          </div>

          {visibleOtherProjects.length ? (
            <div className="grid gap-spacing-3">
              {visibleOtherProjects.map((project) => (
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
              className="bg-[#9f1d1d] text-surface-warm-white hover:bg-[#8b1717]"
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
      <div className="grid min-h-[21rem] gap-0 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)]">
        <ProjectMark seed={project.id} className="min-h-52 lg:min-h-full" />
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
            <button
              type="button"
              onClick={() => onDelete(project)}
              className="rounded-radius-lg px-spacing-5 py-spacing-3 text-sm font-medium text-surface-warm-white/62 hover:bg-surface-warm-white/8 hover:text-surface-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-warm-white"
            >
              Hapus
            </button>
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
      <ProjectMark
        seed={project.id}
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
      <div className="col-start-2 flex items-center gap-spacing-3 sm:col-start-auto">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="rounded-radius-lg border-surface-warm-white/12 bg-surface-warm-white/8 text-surface-warm-white hover:bg-surface-warm-white/12"
        >
          <Link href={`/projects/${project.id}`}>Buka</Link>
        </Button>
        <button
          type="button"
          onClick={() => onDelete(project)}
          className="rounded-radius-lg px-spacing-4 py-spacing-2 text-sm font-medium text-surface-warm-white/62 hover:bg-surface-warm-white/8 hover:text-surface-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-warm-white"
        >
          Hapus
        </button>
      </div>
    </div>
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
      className={`relative overflow-hidden bg-surface-warm-white/[0.05] ${className}`}
      aria-hidden="true"
    >
      <svg className="h-full w-full" viewBox="0 0 600 400" role="img">
        <rect width="600" height="400" fill={mark.background} />
        <path
          d="M0 314 C120 270 185 336 305 292 C420 250 488 276 600 220 L600 400 L0 400 Z"
          fill="#fcfbf8"
          opacity="0.035"
        />
        {mark.shapes.map((shape, index) =>
          shape.kind === "circle" ? (
            <circle
              key={`${shape.x}-${shape.y}-${index}`}
              cx={shape.x + shape.size / 2}
              cy={shape.y + shape.size / 2}
              r={shape.size / 2}
              fill={shape.color}
              opacity={shape.opacity}
            />
          ) : (
            <rect
              key={`${shape.x}-${shape.y}-${index}`}
              width={shape.size}
              height={shape.size}
              x={shape.x}
              y={shape.y}
              rx={shape.radius}
              fill={shape.color}
              opacity={shape.opacity}
              transform={`rotate(${shape.rotate} ${shape.x + shape.size / 2} ${shape.y + shape.size / 2})`}
            />
          ),
        )}
      </svg>
    </div>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

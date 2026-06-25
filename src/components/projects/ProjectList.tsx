"use client";

import { Clock3, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const [isPending, startTransition] = useTransition();

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

  return (
    <>
      <div className="grid gap-spacing-5 md:grid-cols-[1.15fr_0.85fr]">
        {projects.map((project, index) => (
          <article
            key={project.id}
            className={`group relative overflow-hidden rounded-[26px] border border-surface-warm-white/10 bg-surface-warm-white/[0.07] p-spacing-7 outline-none transition duration-300 hover:-translate-y-1 hover:border-surface-warm-white/18 hover:bg-surface-warm-white/[0.1] ${index === 0 ? "md:row-span-2 md:min-h-72" : ""}`}
          >
            <div
              className={`absolute inset-x-0 top-0 h-1 ${index % 3 === 0 ? "bg-[#ff5e27]" : index % 3 === 1 ? "bg-[#ff1f80]" : "bg-[#4777ef]"}`}
              aria-hidden="true"
            />
            <div className="flex h-full flex-col gap-spacing-9">
              <div className="flex items-start justify-between gap-spacing-5">
                <div className="min-w-0">
                  <p className="max-w-full truncate text-sm text-surface-warm-white/52">
                    Terakhir dikerjakan
                  </p>
                  <h3 className="mt-spacing-4 line-clamp-2 text-xl font-semibold leading-tight tracking-[-0.04em] text-surface-warm-white">
                    <Link
                      href={`/projects/${project.id}`}
                      className="rounded-radius-sm outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-surface-warm-white"
                    >
                      {project.title}
                    </Link>
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProject(project)}
                  className="relative z-10 inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-surface-warm-white/10 bg-surface-warm-white/6 text-surface-warm-white/58 transition hover:border-[#ff5e27]/40 hover:bg-[#ff5e27]/12 hover:text-surface-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-warm-white"
                  aria-label={`Hapus ${project.title}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>

              <div className="mt-auto flex items-center justify-between gap-spacing-5 text-sm text-surface-warm-white/50">
                <span className="inline-flex items-center gap-spacing-3">
                  <Clock3 className="size-4" aria-hidden="true" />
                  Diubah {project.updatedAt.toLocaleDateString("id-ID")}
                </span>
                <span className="rounded-full bg-surface-warm-white/8 px-spacing-5 py-spacing-2 text-surface-warm-white/62">
                  Buka
                </span>
              </div>
            </div>
          </article>
        ))}
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

import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FolderKanban } from "lucide-react";
import { useState } from "react";

import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { AdminStatusBadge } from "@/components/admin/status/AdminStatusBadge";
import { AdminStatusFilter } from "@/components/admin/status/AdminStatusFilter";
import { SensitiveText } from "@/components/admin/streamer-mode/SensitiveText";
import { useStreamerMode } from "@/components/admin/streamer-mode/streamer-mode-context";
import { resolveAsyncListState } from "@/lib/async-list-state";
import { fetchJson } from "@/lib/query-client";

type AdminProject = {
  accessStatus: "published" | "has_preview" | "none";
  buildStatus: string;
  createdAt: string;
  hasWorkingSnapshot: boolean;
  id: string;
  latestOperationOutcome: "failed" | "running" | "succeeded" | "idle";
  owner: {
    email: string | null;
    id: string;
    name: string | null;
  };
  publishedUrl: string | null;
  status: string;
  thumbnailUrl: string | null;
  title: string;
  updatedAt: string;
};

type ProjectsResponse = {
  projects: AdminProject[];
  total: number;
};

const PROJECT_STATUS_OPTIONS = [
  { value: "ready", label: "Siap" },
  { value: "active", label: "Berjalan" },
  { value: "needs_attention", label: "Gagal" },
  { value: "all", label: "Semua" },
] as const;

export const Route = createFileRoute("/_main/admin/projects")({
  component: ProjectsPage,
});

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function ProjectListSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-spacing-2" role="status">
      {["one", "two", "three"].map((key) => (
        <div
          className="flex h-32 animate-pulse gap-spacing-3 rounded-radius-md border border-black/10 bg-black/[0.03] p-spacing-3 dark:border-surface-warm-white/10 dark:bg-surface-warm-white/5"
          key={key}
        >
          <span className="h-full w-36 shrink-0 rounded-radius-md bg-black/5 dark:bg-surface-warm-white/8" />
          <div className="flex min-w-0 flex-1 flex-col gap-spacing-3 py-spacing-2">
            <span className="h-4 w-48 max-w-full rounded bg-black/10 dark:bg-surface-warm-white/10" />
            <span className="h-3 w-64 max-w-full rounded bg-black/5 dark:bg-surface-warm-white/8" />
            <span className="h-6 w-24 rounded bg-black/5 dark:bg-surface-warm-white/8" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectsPage() {
  const streamerMode = useStreamerMode();
  const [status, setStatus] = useState("ready");
  const [q, setQ] = useState("");
  const { data, isError, isPending, refetch } = useQuery({
    queryFn: () =>
      fetchJson<ProjectsResponse>(
        `/api/admin/projects?status=${status}&q=${encodeURIComponent(q)}`,
      ),
    queryKey: ["admin", "projects", status, q],
  });
  const projects = data?.projects ?? [];
  const listState = resolveAsyncListState({
    isError,
    isPending,
    items: data?.projects,
  });

  return (
    <div className="flex flex-col gap-spacing-4">
      <AdminStatusFilter
        onChange={setStatus}
        options={PROJECT_STATUS_OPTIONS}
        value={status}
      />
      <AdminSearchInput
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari judul proyek, email, atau nama pemilik…"
        value={q}
      />

      {listState === "loading" ? (
        <ProjectListSkeleton />
      ) : listState === "error" ? (
        <div className="flex flex-col items-center gap-spacing-3 py-spacing-8 text-center">
          <p className="text-sm text-[#5f5f5d] dark:text-surface-warm-white/70">
            Proyek belum bisa dimuat.
          </p>
          <button
            className="rounded-radius-md border border-black/15 px-spacing-3 py-spacing-2 text-sm text-[#1c1c1c] hover:bg-black/5 dark:border-surface-warm-white/15 dark:text-surface-warm-white dark:hover:bg-surface-warm-white/10"
            onClick={() => void refetch()}
            type="button"
          >
            Coba lagi
          </button>
        </div>
      ) : listState === "empty" ? (
        <div className="flex flex-col items-center justify-center rounded-radius-lg border border-dashed border-black/10 py-spacing-12 text-center text-[#5f5f5d] dark:border-surface-warm-white/10 dark:text-surface-warm-white/40">
          <FolderKanban className="size-8 opacity-40" />
          <p className="mt-spacing-3 text-sm">
            {status === "needs_attention"
              ? "Tidak ada proyek gagal."
              : status === "active"
                ? "Tidak ada proyek berjalan."
                : q
                  ? "Tidak ada proyek yang cocok dengan pencarian."
                  : "Belum ada proyek."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-spacing-3">
          <div className="flex items-center justify-between px-1 text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
            <span>
              Menampilkan {projects.length} dari{" "}
              {data?.total ?? projects.length} proyek
            </span>
          </div>
          <div className="flex flex-col gap-spacing-2">
            {projects.map((project) => (
              <article
                className="rounded-radius-md border border-black/10 bg-[#fcfbf8] p-spacing-3 text-sm text-[#1c1c1c] dark:border-surface-warm-white/12 dark:bg-surface-warm-white/5 dark:text-surface-warm-white"
                key={project.id}
              >
                <div className="flex flex-col gap-spacing-3 sm:flex-row sm:items-start">
                  <div className="h-24 w-full shrink-0 overflow-hidden rounded-radius-md border border-black/10 bg-black/5 sm:w-36 dark:border-surface-warm-white/12 dark:bg-surface-warm-white/8">
                    {project.thumbnailUrl ? (
                      <img
                        alt={`Thumbnail ${project.title}`}
                        className="h-full w-full object-cover"
                        src={project.thumbnailUrl}
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-xs text-[#5f5f5d] dark:text-surface-warm-white/48">
                        Belum ada thumbnail
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-spacing-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="truncate font-medium text-[#1c1c1c] dark:text-surface-warm-white">
                        <a
                          className="underline-offset-2 hover:underline"
                          href={`/projects/${project.id}`}
                        >
                          {streamerMode ? (
                            <SensitiveText kind="name" value={project.title} />
                          ) : (
                            project.title
                          )}
                        </a>
                      </h2>
                      <p className="mt-spacing-1 text-[#5f5f5d] dark:text-surface-warm-white/70">
                        {streamerMode && project.owner.name ? (
                          <SensitiveText
                            kind="name"
                            value={project.owner.name}
                          />
                        ) : (
                          (project.owner.name ?? "Tanpa nama")
                        )}
                        {" · "}
                        {streamerMode && project.owner.email ? (
                          <SensitiveText
                            kind="email"
                            value={project.owner.email}
                          />
                        ) : (
                          (project.owner.email ?? "Tanpa email")
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-spacing-2 text-xs sm:justify-end">
                      <AdminStatusBadge
                        tone={
                          project.latestOperationOutcome === "failed"
                            ? "danger"
                            : project.latestOperationOutcome === "running"
                              ? "pending"
                              : project.latestOperationOutcome === "succeeded"
                                ? "success"
                                : "neutral"
                        }
                      >
                        Aktivitas:{" "}
                        {project.latestOperationOutcome === "failed"
                          ? "Gagal"
                          : project.latestOperationOutcome === "running"
                            ? "Proses"
                            : project.latestOperationOutcome === "succeeded"
                              ? "Selesai"
                              : "Diskusi"}
                      </AdminStatusBadge>
                      <AdminStatusBadge
                        tone={
                          project.accessStatus === "published"
                            ? "success"
                            : project.accessStatus === "has_preview"
                              ? "neutral"
                              : "neutral"
                        }
                      >
                        Akses:{" "}
                        {project.accessStatus === "published"
                          ? "Terbit"
                          : project.accessStatus === "has_preview"
                            ? "Ada Preview"
                            : "Belum Ada"}
                      </AdminStatusBadge>
                      {project.accessStatus === "has_preview" && (
                        <a
                          className="rounded-radius-sm border border-emerald-500/20 bg-emerald-500/10 px-spacing-2 py-spacing-1 text-emerald-700 underline-offset-2 hover:bg-emerald-500/15 dark:border-emerald-400/20 dark:text-emerald-300"
                          href={`/projects/${project.id}`}
                        >
                          Buka Preview
                        </a>
                      )}
                      {project.publishedUrl && (
                        <a
                          className="rounded-radius-sm border border-blue-500/20 bg-blue-500/10 px-spacing-2 py-spacing-1 text-blue-700 underline-offset-2 hover:bg-blue-500/15 dark:border-blue-400/20 dark:text-blue-300"
                          href={project.publishedUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Lihat Live
                        </a>
                      )}
                      <a
                        className="rounded-radius-sm border border-black/15 px-spacing-2 py-spacing-1 text-[#1c1c1c] underline-offset-2 hover:bg-black/5 hover:underline dark:border-surface-warm-white/20 dark:text-surface-warm-white dark:hover:bg-surface-warm-white/8"
                        href={`/projects/${project.id}`}
                      >
                        Lihat detail
                      </a>
                    </div>
                  </div>
                </div>
                <dl className="mt-spacing-3 grid gap-spacing-2 text-xs text-[#5f5f5d] sm:grid-cols-2 dark:text-surface-warm-white/70">
                  <div>
                    <dt className="sr-only">Dibuat</dt>
                    <dd>Dibuat {formatDate(project.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Diperbarui</dt>
                    <dd>Diperbarui {formatDate(project.updatedAt)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

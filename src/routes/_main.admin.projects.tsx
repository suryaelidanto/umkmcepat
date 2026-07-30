import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { SensitiveText } from "@/components/admin/SensitiveText";
import { useStreamerMode } from "@/components/admin/streamer-mode-context";
import { fetchJson } from "@/lib/query-client";

type AdminProject = {
  buildStatus: string;
  createdAt: string;
  id: string;
  owner: {
    email: string | null;
    id: string;
    name: string | null;
  };
  status: string;
  thumbnailUrl: string | null;
  title: string;
  updatedAt: string;
};

type ProjectsResponse = {
  projects: AdminProject[];
};

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

function ProjectsPage() {
  const streamerMode = useStreamerMode();
  const { data } = useQuery({
    queryFn: () => fetchJson<ProjectsResponse>("/api/admin/projects"),
    queryKey: ["admin", "projects"],
  });
  const projects = data?.projects ?? [];

  if (projects.length === 0) {
    return <p className="text-surface-warm-white/70">Belum ada proyek.</p>;
  }

  return (
    <div className="flex flex-col gap-spacing-2">
      {projects.map((project) => (
        <article
          className="rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-3 text-sm"
          key={project.id}
        >
          <div className="flex flex-col gap-spacing-3 sm:flex-row sm:items-start">
            <div className="h-24 w-full shrink-0 overflow-hidden rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/8 sm:w-36">
              {project.thumbnailUrl ? (
                <img
                  alt={`Thumbnail ${project.title}`}
                  className="h-full w-full object-cover"
                  src={project.thumbnailUrl}
                />
              ) : (
                <div className="grid h-full place-items-center text-xs text-surface-warm-white/48">
                  Belum ada thumbnail
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-spacing-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="truncate font-medium text-surface-warm-white">
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
                <p className="mt-spacing-1 text-surface-warm-white/70">
                  {streamerMode && project.owner.name ? (
                    <SensitiveText kind="name" value={project.owner.name} />
                  ) : (
                    (project.owner.name ?? "Tanpa nama")
                  )}
                  {" · "}
                  {streamerMode && project.owner.email ? (
                    <SensitiveText kind="email" value={project.owner.email} />
                  ) : (
                    (project.owner.email ?? "Tanpa email")
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-spacing-2 text-xs text-surface-warm-white/70 sm:justify-end">
                <span className="rounded-radius-sm border border-surface-warm-white/12 px-spacing-2 py-spacing-1">
                  {project.status}
                </span>
                <span className="rounded-radius-sm border border-surface-warm-white/12 px-spacing-2 py-spacing-1">
                  Build: {project.buildStatus}
                </span>
                <a
                  className="rounded-radius-sm border border-surface-warm-white/20 px-spacing-2 py-spacing-1 text-surface-warm-white underline-offset-2 hover:bg-surface-warm-white/8 hover:underline"
                  href={`/projects/${project.id}`}
                >
                  Lihat detail
                </a>
              </div>
            </div>
          </div>
          <dl className="mt-spacing-3 grid gap-spacing-2 text-xs text-surface-warm-white/70 sm:grid-cols-2">
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
  );
}

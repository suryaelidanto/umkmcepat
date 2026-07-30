import type { ProjectViewerData } from "@/lib/admin-project-observer";
import type { UIMessage } from "ai";

import { getTextFromUIMessage } from "@/lib/projects/chat-memory";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function messageLabel(message: UIMessage) {
  if (message.role === "user") {
    return "Pengguna";
  }
  if (message.role === "assistant") {
    return "AI";
  }
  return "Sistem";
}

export function AdminProjectObserver({
  project,
}: {
  project: ProjectViewerData;
}) {
  const messages = project.initialChatPage.messages;
  const card = project.initialWorkspaceCard;
  const brief = project.initialBrief;
  const briefItems = [
    ["Nama usaha", brief.businessName],
    ["Jenis usaha", brief.businessType],
    ["Penawaran", brief.offer],
    ["Target pelanggan", brief.targetCustomer],
    ["CTA/kontak", brief.contactOrCta],
    ["Gaya", brief.stylePreference],
  ].filter(([, value]) => value);

  return (
    <main className="min-h-dvh bg-[#151515] px-spacing-4 py-spacing-6 text-surface-warm-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-spacing-5">
        <div className="rounded-radius-lg border border-surface-warm-white/14 bg-surface-warm-white/8 p-spacing-4 text-sm text-surface-warm-white/82">
          Mode admin baca-saja. Tidak ada aksi yang dikirim ke proyek pengguna.
        </div>

        <section className="rounded-radius-2xl border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-5">
          <div className="flex flex-col gap-spacing-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-surface-warm-white/58">
                Proyek pengguna
              </p>
              <h1 className="mt-spacing-1 text-2xl font-semibold text-surface-warm-white">
                {project.title}
              </h1>
              <p className="mt-spacing-2 text-sm text-surface-warm-white/70">
                {project.owner.name ?? "Tanpa nama"} ·{" "}
                {project.owner.email ?? "Tanpa email"}
              </p>
            </div>
            <div className="flex flex-wrap gap-spacing-2 text-xs text-surface-warm-white/70">
              <span className="rounded-radius-sm border border-surface-warm-white/12 px-spacing-2 py-spacing-1">
                {project.status}
              </span>
              <span className="rounded-radius-sm border border-surface-warm-white/12 px-spacing-2 py-spacing-1">
                Build: {project.buildStatus}
              </span>
            </div>
          </div>
          <dl className="mt-spacing-4 grid gap-spacing-3 text-sm text-surface-warm-white/70 sm:grid-cols-2">
            <div>
              <dt className="text-surface-warm-white/48">Dibuat</dt>
              <dd>{formatDate(project.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-surface-warm-white/48">Diperbarui</dt>
              <dd>{formatDate(project.updatedAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-radius-2xl border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-5">
          <h2 className="text-lg font-semibold">Prompt awal</h2>
          <p className="mt-spacing-3 whitespace-pre-wrap text-sm leading-6 text-surface-warm-white/78">
            {project.initialPrompt || "Tidak ada prompt awal."}
          </p>
        </section>

        <section className="rounded-radius-2xl border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-5">
          <h2 className="text-lg font-semibold">Ringkasan rancangan</h2>
          {card.type === "build_recommendation" ? (
            <div className="mt-spacing-3">
              <p className="font-medium">{card.title}</p>
              <ul className="mt-spacing-2 list-disc space-y-spacing-1 pl-spacing-5 text-sm text-surface-warm-white/72">
                {card.summary.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : card.type === "question" ? (
            <p className="mt-spacing-3 text-sm text-surface-warm-white/72">
              Pertanyaan aktif: {card.question.question}
            </p>
          ) : briefItems.length ? (
            <dl className="mt-spacing-3 grid gap-spacing-3 text-sm sm:grid-cols-2">
              {briefItems.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-surface-warm-white/48">{label}</dt>
                  <dd className="text-surface-warm-white/78">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-spacing-3 text-sm text-surface-warm-white/60">
              Belum ada ringkasan rancangan.
            </p>
          )}
        </section>

        <section className="rounded-radius-2xl border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-5">
          <h2 className="text-lg font-semibold">Chat proyek</h2>
          {project.initialChatPage.hasMore ? (
            <p className="mt-spacing-1 text-xs text-surface-warm-white/52">
              Menampilkan pesan terbaru.
            </p>
          ) : null}
          {messages.length ? (
            <div className="mt-spacing-4 flex flex-col gap-spacing-3">
              {messages.map((message) => (
                <article
                  className="rounded-[18px] border border-surface-warm-white/10 bg-[#242421] p-spacing-4 text-sm text-surface-warm-white/78"
                  key={message.id}
                >
                  <p className="mb-spacing-2 text-xs font-medium text-surface-warm-white/48">
                    {messageLabel(message)}
                  </p>
                  <p className="whitespace-pre-wrap leading-6">
                    {getTextFromUIMessage(message) || "[pesan non-teks]"}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-spacing-3 text-sm text-surface-warm-white/60">
              Belum ada chat tersimpan.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

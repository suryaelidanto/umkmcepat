import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { ImagePlus, Loader2, MessageSquare, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { SupportCategory, SupportTicketStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { ImageUploadThumb } from "@/components/ui/image-upload-thumb";
import { Link } from "@/components/ui/link";
import { fetchJson } from "@/lib/query-client";

type TicketWithLastMessage = {
  id: string;
  subject: string;
  category: SupportCategory;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  messages: Array<{
    id: string;
    body: string;
    createdAt: string;
  }>;
};

const CATEGORY_LABELS: Record<SupportCategory, string> = {
  TEKNIS: "Masalah Teknis",
  PEMBAYARAN: "Pembayaran & Kuota",
  UMUM: "Pertanyaan Umum",
};

const CATEGORY_COLORS: Record<SupportCategory, string> = {
  TEKNIS: "bg-accent-rose-subtle text-accent-rose border-accent-rose-border",
  PEMBAYARAN:
    "bg-accent-orange-subtle text-accent-orange border-accent-orange-border",
  UMUM: "bg-accent-gold-subtle text-accent-gold border-accent-gold-border",
};

export function SupportDashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportCategory>("TEKNIS");
  const [body, setBody] = useState("");
  const { pathname } = useRouterState({ select: (s) => s.location });
  const isTicketThread =
    pathname !== "/support" && pathname.startsWith("/support/");

  // Attachments state
  const [attachments, setAttachments] = useState<
    Array<{ id: string; url: string; file: File; uploading: boolean }>
  >([]);

  const ticketsQuery = useQuery({
    queryKey: ["support", "tickets"],
    queryFn: () =>
      fetchJson<{ tickets: TicketWithLastMessage[] }>("/api/support/tickets"),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/support/assets", {
        method: "POST",
        body: formData,
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.message || "Gagal mengunggah gambar.");
      }
      return json as { assetId: string; url: string };
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: {
      subject: string;
      category: SupportCategory;
      body: string;
      assetIds: string[];
    }) => {
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.message || "Gagal membuat tiket.");
      }
      return json as { ticketId: string };
    },
    onSuccess: (data) => {
      toast.success("Tiket bantuan berhasil dibuat.");
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support", "unread-count"] });
      setSubject("");
      setBody("");
      setAttachments([]);
      setFormOpen(false);
      // Navigate to the created ticket (SPA navigation so the parent Outlet picks up the child route)
      void router.navigate({
        to: "/support/$ticketId",
        params: { ticketId: data.ticketId },
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Gagal membuat tiket.",
      );
    },
  });

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files) {
      return;
    }

    const fileList = Array.from(files);
    if (attachments.length + fileList.length > 3) {
      toast.error("Maksimal 3 gambar lampiran diperbolehkan.");
      return;
    }

    for (const file of fileList) {
      const localId = Math.random().toString();
      const localUrl = URL.createObjectURL(file);

      // Add to local state as uploading
      setAttachments((prev) => [
        ...prev,
        { id: localId, url: localUrl, file, uploading: true },
      ]);

      try {
        const result = await uploadMutation.mutateAsync(file);
        // Update state with server asset ID
        setAttachments((prev) =>
          prev.map((item) =>
            item.id === localId
              ? { ...item, id: result.assetId, uploading: false }
              : item,
          ),
        );
      } catch (err) {
        toast.error(
          `Gagal mengunggah ${file.name}: ${err instanceof Error ? err.message : "Error unknown"}`,
        );
        // Remove from list
        setAttachments((prev) => prev.filter((item) => item.id !== localId));
      }
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      toast.error("Subject wajib diisi.");
      return;
    }
    if (!body.trim()) {
      toast.error("Detail pesan wajib diisi.");
      return;
    }
    const assetIds = attachments
      .filter((item) => !item.uploading)
      .map((item) => item.id);
    createMutation.mutate({
      subject,
      category,
      body,
      assetIds,
    });
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) {
      return "Baru saja";
    }
    if (diffMins < 60) {
      return `${diffMins} menit lalu`;
    }
    if (diffHours < 24) {
      return `${diffHours} jam lalu`;
    }
    return `${diffDays} hari lalu`;
  };

  if (isTicketThread) {
    return <Outlet />;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-3 pb-24 pt-6 text-[#1c1c1c] transition-colors duration-200 dark:text-surface-warm-white sm:px-6 lg:px-8">
      <div className="flex w-full flex-col">
        <div className="flex items-center justify-between border-b border-black/10 pb-spacing-4 dark:border-surface-warm-white/10">
          <div>
            <h1 className="text-heading-lg font-semibold tracking-tight text-[#1c1c1c] dark:text-surface-warm-white">
              Pusat Bantuan & Dukungan
            </h1>
            <p className="text-sm text-[#5f5f5d] dark:text-surface-warm-white/60">
              Kirim kendala teknis, pembayaran, atau pertanyaan umum Anda di
              sini.
            </p>
          </div>
          {!formOpen && (
            <Button
              onClick={() => setFormOpen(true)}
              className="flex items-center gap-spacing-2"
            >
              <Plus className="size-4" />
              Buat Tiket
            </Button>
          )}
        </div>

        {formOpen && (
          <div className="mt-spacing-4 rounded-2xl border border-black/10 bg-[#fcfbf8] p-5 sm:p-6 shadow-sm dark:border-white/10 dark:bg-[#1c1c1a]">
            <div className="flex items-center justify-between border-b border-black/10 pb-4 dark:border-white/10">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#1c1c1c] dark:text-surface-warm-white">
                  Buat Tiket Bantuan
                </h2>
                <p className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/60 mt-0.5">
                  Tim kami akan merespons kendala teknis atau pertanyaanmu
                  secepatnya.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg p-1.5 text-[#5f5f5d] hover:bg-black/5 hover:text-[#1c1c1c] dark:text-surface-warm-white/60 dark:hover:bg-white/10 dark:hover:text-surface-warm-white transition cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="subject"
                  className="text-xs font-bold text-[#1c1c1c] dark:text-surface-warm-white/90"
                >
                  Subjek Kendala
                </label>
                <input
                  id="subject"
                  type="text"
                  required
                  maxLength={140}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Jelaskan kendala yang kamu alami"
                  className="h-11 w-full rounded-xl border border-black/15 bg-white px-3.5 text-sm text-[#1c1c1c] outline-none placeholder:text-[#5f5f5d]/60 focus:border-accent-orange focus:ring-1 focus:ring-accent-orange dark:border-white/15 dark:bg-white/[0.04] dark:text-surface-warm-white dark:placeholder:text-surface-warm-white/40 shadow-2xs transition"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="category"
                  className="text-xs font-bold text-[#1c1c1c] dark:text-surface-warm-white/90"
                >
                  Kategori
                </label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as SupportCategory)
                  }
                  className="h-11 w-full rounded-xl border border-black/15 bg-white px-3.5 text-sm text-[#1c1c1c] outline-none focus:border-accent-orange focus:ring-1 focus:ring-accent-orange dark:border-white/15 dark:bg-[#171715] dark:text-surface-warm-white shadow-2xs transition cursor-pointer"
                >
                  {Object.keys(CATEGORY_LABELS).map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat as SupportCategory]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="body"
                  className="text-xs font-bold text-[#1c1c1c] dark:text-surface-warm-white/90"
                >
                  Detail Pesan
                </label>
                <textarea
                  id="body"
                  required
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Jelaskan secara rinci kendala Anda..."
                  className="w-full resize-y rounded-xl border border-black/15 bg-white p-3.5 text-sm text-[#1c1c1c] outline-none placeholder:text-[#5f5f5d]/60 focus:border-accent-orange focus:ring-1 focus:ring-accent-orange dark:border-white/15 dark:bg-white/[0.04] dark:text-surface-warm-white dark:placeholder:text-surface-warm-white/40 shadow-2xs transition"
                />
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-[#1c1c1c] dark:text-surface-warm-white/90">
                  Lampiran Gambar (Maks 3, Opsional)
                </span>
                <div className="flex flex-wrap gap-3">
                  {attachments.map((item) => (
                    <ImageUploadThumb
                      alt="Attachment preview"
                      className="size-16 rounded-xl overflow-hidden shadow-2xs"
                      key={item.id}
                      onRemove={() => removeAttachment(item.id)}
                      src={item.url}
                      uploading={item.uploading}
                    />
                  ))}

                  {attachments.length < 3 && (
                    <label className="flex size-16 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-black/20 bg-white hover:border-black/40 hover:bg-black/[0.02] dark:border-white/20 dark:bg-white/[0.02] dark:hover:border-white/40 dark:hover:bg-white/[0.05] transition shadow-2xs">
                      <ImagePlus className="size-5 text-[#5f5f5d] dark:text-surface-warm-white/60" />
                      <span className="mt-1 text-[10px] font-semibold text-[#5f5f5d] dark:text-surface-warm-white/60">
                        Upload
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-end gap-2.5 pt-2 border-t border-black/10 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-xl border border-black/15 bg-white px-4 py-2.5 text-xs font-semibold text-[#1c1c1c] hover:bg-black/5 dark:border-white/15 dark:bg-white/[0.04] dark:text-surface-warm-white dark:hover:bg-white/10 shadow-2xs transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={
                    createMutation.isPending ||
                    attachments.some((item) => item.uploading)
                  }
                  className="flex items-center gap-2 rounded-xl bg-[#1c1c1c] px-5 py-2.5 text-xs font-bold text-white hover:bg-black active:scale-95 dark:bg-surface-warm-white dark:text-foreground-primary dark:hover:bg-white shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  {createMutation.isPending && (
                    <Loader2 className="size-3.5 animate-spin" />
                  )}
                  <span>Kirim Tiket</span>
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="mt-spacing-6 flex flex-col gap-spacing-3">
          <div className="flex items-center justify-between border-b border-black/5 pb-2 dark:border-surface-warm-white/5">
            <h2 className="text-lg font-medium">Tiket Anda</h2>
            {ticketsQuery.data?.tickets &&
              ticketsQuery.data.tickets.length > 0 && (
                <span className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
                  {ticketsQuery.data.tickets.length} tiket
                </span>
              )}
          </div>

          {ticketsQuery.isLoading ? (
            <div className="flex justify-center py-spacing-8">
              <Loader2 className="size-6 animate-spin text-[#5f5f5d] dark:text-surface-warm-white/60" />
            </div>
          ) : ticketsQuery.data?.tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-radius-lg border border-dashed border-black/10 py-spacing-10 text-center dark:border-surface-warm-white/10">
              <MessageSquare className="size-8 text-black/30 dark:text-surface-warm-white/30" />
              <p className="mt-spacing-3 text-sm text-[#5f5f5d] dark:text-surface-warm-white/60">
                Belum ada tiket bantuan yang dibuat.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {ticketsQuery.data?.tickets.map((ticket) => {
                const lastMsg = ticket.messages[0];
                const shortId = ticket.id.slice(-8).toUpperCase();
                return (
                  <Link
                    key={ticket.id}
                    href={`/support/${ticket.id}`}
                    className="flex flex-col gap-2 rounded-xl border border-black/10 bg-[#fcfbf8] p-4 text-[#1c1c1c] shadow-2xs transition hover:border-black/20 hover:bg-white dark:border-surface-warm-white/10 dark:bg-surface-warm-white/5 dark:text-surface-warm-white dark:hover:bg-surface-warm-white/8"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[#5f5f5d] dark:text-surface-warm-white/50">
                          #{shortId}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${CATEGORY_COLORS[ticket.category]}`}
                        >
                          {CATEGORY_LABELS[ticket.category]}
                        </span>
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold ${
                          ticket.status === "OPEN"
                            ? "bg-accent-orange-subtle border-accent-orange-border text-accent-orange"
                            : "bg-black/5 text-black/50 border-black/10 dark:bg-surface-warm-white/10 dark:text-surface-warm-white/50 dark:border-surface-warm-white/10"
                        }`}
                      >
                        {ticket.status === "OPEN" ? "BUKA" : "SELESAI"}
                      </span>
                    </div>

                    <h3 className="line-clamp-1 font-bold text-sm text-[#1c1c1c] dark:text-surface-warm-white">
                      {ticket.subject}
                    </h3>

                    {lastMsg && (
                      <p className="line-clamp-1 text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
                        {lastMsg.body}
                      </p>
                    )}

                    <div className="mt-1 flex justify-end border-t border-black/5 pt-2 text-[10px] font-medium text-[#5f5f5d] dark:border-surface-warm-white/5 dark:text-surface-warm-white/40">
                      Aktif {formatTimeAgo(ticket.updatedAt)}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

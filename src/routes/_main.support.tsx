import { SupportCategory, SupportTicketStatus } from "@prisma/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  Outlet,
  redirect,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ImagePlus, Loader2, MessageSquare, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ImageUploadThumb } from "@/components/ui/image-upload-thumb";
import { Link } from "@/components/ui/link";
import { auth } from "@/lib/auth";
import { fetchJson } from "@/lib/query-client";

const requireAuth = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    throw redirect({ to: "/" });
  }
  return { ok: true };
});

export const Route = createFileRoute("/_main/support")({
  beforeLoad: async () => {
    await requireAuth();
  },
  component: SupportPage,
});

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
  TEKNIS: "bg-aurora-rose/10 text-aurora-rose border-aurora-rose/20",
  PEMBAYARAN: "bg-aurora-orange/10 text-aurora-orange border-aurora-orange/20",
  UMUM: "bg-aurora-gold/10 text-aurora-gold border-aurora-gold/20",
};

function SupportPage() {
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

      const response = await fetch("/api/uploads/temp-images", {
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
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-spacing-4 pb-24 pt-spacing-4 text-[#1c1c1c] transition-colors duration-200 dark:text-surface-warm-white">
      <div className="flex items-center justify-between border-b border-black/10 pb-spacing-4 dark:border-surface-warm-white/10">
        <div>
          <h1 className="text-heading-lg font-semibold tracking-tight text-[#1c1c1c] dark:text-surface-warm-white">
            Pusat Bantuan & Dukungan
          </h1>
          <p className="text-sm text-[#5f5f5d] dark:text-surface-warm-white/60">
            Kirim kendala teknis, pembayaran, atau pertanyaan umum Anda di sini.
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
        <div className="mt-spacing-4 rounded-radius-lg border border-black/10 bg-black/[0.02] p-spacing-5 dark:border-surface-warm-white/10 dark:bg-surface-warm-white/5">
          <div className="flex items-center justify-between border-b border-black/10 pb-spacing-3 dark:border-surface-warm-white/10">
            <h2 className="text-lg font-medium text-[#1c1c1c] dark:text-surface-warm-white">
              Buat Tiket Baru
            </h2>
            <button
              onClick={() => setFormOpen(false)}
              className="text-[#5f5f5d] hover:text-[#1c1c1c] dark:text-surface-warm-white/60 dark:hover:text-surface-warm-white"
            >
              <X className="size-5" />
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            className="mt-spacing-4 flex flex-col gap-spacing-4"
          >
            <div className="flex flex-col gap-spacing-1">
              <label
                htmlFor="subject"
                className="text-xs font-semibold text-[#1c1c1c] dark:text-surface-warm-white/80"
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
                placeholder="Contoh: Eror saat generate halaman kontak / Pembayaran energi belum masuk"
                className="h-10 w-full rounded-radius-md border border-black/15 bg-transparent px-spacing-3 text-sm text-[#1c1c1c] outline-none placeholder:text-black/30 focus:ring-1 focus:ring-aurora-orange dark:border-surface-warm-white/10 dark:text-surface-warm-white dark:placeholder:text-surface-warm-white/30"
              />
            </div>

            <div className="flex flex-col gap-spacing-1">
              <label
                htmlFor="category"
                className="text-xs font-semibold text-[#1c1c1c] dark:text-surface-warm-white/80"
              >
                Kategori
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as SupportCategory)}
                className="h-10 w-full rounded-radius-md border border-black/15 bg-[#fcfbf8] px-spacing-3 text-sm text-[#1c1c1c] outline-none focus:ring-1 focus:ring-aurora-orange dark:border-surface-warm-white/10 dark:bg-[#171715] dark:text-surface-warm-white"
              >
                {Object.keys(CATEGORY_LABELS).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat as SupportCategory]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-spacing-1">
              <label
                htmlFor="body"
                className="text-xs font-semibold text-[#1c1c1c] dark:text-surface-warm-white/80"
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
                className="w-full resize-y rounded-radius-md border border-black/15 bg-transparent p-spacing-3 text-sm text-[#1c1c1c] outline-none placeholder:text-black/30 focus:ring-1 focus:ring-aurora-orange dark:border-surface-warm-white/10 dark:text-surface-warm-white dark:placeholder:text-surface-warm-white/30"
              />
            </div>

            <div className="flex flex-col gap-spacing-2">
              <span className="text-xs font-semibold text-[#1c1c1c] dark:text-surface-warm-white/80">
                Lampiran Gambar (Maks 3, Opsional)
              </span>
              <div className="flex flex-wrap gap-spacing-3">
                {attachments.map((item) => (
                  <ImageUploadThumb
                    alt="Attachment preview"
                    className="size-16"
                    key={item.id}
                    onRemove={() => removeAttachment(item.id)}
                    src={item.url}
                    uploading={item.uploading}
                  />
                ))}

                {attachments.length < 3 && (
                  <label className="flex size-16 cursor-pointer flex-col items-center justify-center rounded-radius-md border border-dashed border-black/20 bg-black/[0.03] hover:border-black/40 hover:bg-black/[0.06] dark:border-surface-warm-white/20 dark:bg-surface-warm-white/5 dark:hover:border-surface-warm-white/40 dark:hover:bg-surface-warm-white/10">
                    <ImagePlus className="size-5 text-[#5f5f5d] dark:text-surface-warm-white/60" />
                    <span className="mt-1 text-[9px] text-[#5f5f5d] dark:text-surface-warm-white/60">
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

            <div className="flex justify-end gap-spacing-3 border-t border-black/10 pt-spacing-4 dark:border-surface-warm-white/10">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={
                  createMutation.isPending ||
                  attachments.some((item) => item.uploading)
                }
              >
                {createMutation.isPending ? "Mengirim..." : "Kirim Tiket"}
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="mt-spacing-6 flex flex-col gap-spacing-3">
        <h2 className="border-b border-black/5 pb-2 text-lg font-medium dark:border-surface-warm-white/5">
          Tiket Anda
        </h2>

        {ticketsQuery.isLoading ? (
          <div className="flex justify-center py-spacing-8">
            <Loader2 className="size-6 animate-spin text-surface-warm-white/60" />
          </div>
        ) : ticketsQuery.data?.tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-radius-lg border border-dashed border-surface-warm-white/10 py-spacing-10 text-center">
            <MessageSquare className="size-8 text-surface-warm-white/30" />
            <p className="mt-spacing-3 text-sm text-surface-warm-white/60">
              Belum ada tiket bantuan yang dibuat.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-spacing-3">
            {ticketsQuery.data?.tickets.map((ticket) => {
              const lastMsg = ticket.messages[0];
              const shortId = ticket.id.slice(-8).toUpperCase();
              return (
                <Link
                  key={ticket.id}
                  href={`/support/${ticket.id}`}
                  className="flex flex-col gap-spacing-2 rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-spacing-4 transition hover:bg-surface-warm-white/8 hover:border-surface-warm-white/20"
                >
                  <div className="flex items-start justify-between gap-spacing-3">
                    <div className="flex items-center gap-spacing-2">
                      <span className="text-xs font-mono text-surface-warm-white/40">
                        #{shortId}
                      </span>
                      <span
                        className={`rounded-radius-sm border px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_COLORS[ticket.category]}`}
                      >
                        {CATEGORY_LABELS[ticket.category]}
                      </span>
                    </div>
                    <span
                      className={`rounded-radius-sm px-2 py-0.5 text-[10px] font-bold ${
                        ticket.status === "OPEN"
                          ? "bg-aurora-orange/15 text-aurora-orange"
                          : "bg-surface-warm-white/10 text-surface-warm-white/50"
                      }`}
                    >
                      {ticket.status === "OPEN" ? "BUKA" : "SELESAI"}
                    </span>
                  </div>

                  <h3 className="font-semibold text-sm line-clamp-1">
                    {ticket.subject}
                  </h3>

                  {lastMsg && (
                    <p className="text-xs text-surface-warm-white/60 line-clamp-1">
                      {lastMsg.body}
                    </p>
                  )}

                  <div className="flex justify-end text-[10px] text-surface-warm-white/40 border-t border-surface-warm-white/5 pt-spacing-2 mt-spacing-1">
                    Aktif {formatTimeAgo(ticket.updatedAt)}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImagePlus, Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { SupportCategory, SupportTicketStatus } from "@prisma/client";

import { ticketStatusDisplay } from "@/components/admin/status/admin-status";
import { AdminStatusBadge } from "@/components/admin/status/AdminStatusBadge";
import { SensitiveText } from "@/components/admin/streamer-mode/SensitiveText";
import { Button } from "@/components/ui/button";
import {
  ImageLightbox,
  type LightboxImage,
} from "@/components/ui/image-lightbox";
import { ImageUploadThumb } from "@/components/ui/image-upload-thumb";
import { Link } from "@/components/ui/link";
import { fetchJson } from "@/lib/query-client";

export type TicketMessage = {
  id: string;
  authorId: string;
  authorRole: "user" | "admin";
  body: string;
  createdAt: string;
  assetIds: string[];
  readAt?: string | null;
};

export type TicketDetail = {
  id: string;
  subject: string;
  category: SupportCategory;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    email: string | null;
    name: string | null;
  };
  messages: TicketMessage[];
};

const CATEGORY_LABELS: Record<SupportCategory, string> = {
  TEKNIS: "Masalah Teknis",
  PEMBAYARAN: "Pembayaran & Kuota",
  UMUM: "Pertanyaan Umum",
};

export function TicketThreadView({
  ticketId,
  isAdmin = false,
  backUrl,
}: {
  ticketId: string;
  isAdmin?: boolean;
  backUrl: string;
}) {
  const queryClient = useQueryClient();
  const [replyBody, setReplyBody] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Attachments state
  const [attachments, setAttachments] = useState<
    Array<{ id: string; url: string; file: File; uploading: boolean }>
  >([]);
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const queryEndpoint = isAdmin
    ? `/api/admin/tickets/${ticketId}`
    : `/api/support/tickets/${ticketId}`;
  const queryKey = isAdmin
    ? ["admin", "tickets", ticketId]
    : ["support", "tickets", ticketId];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetchJson<{ ticket: TicketDetail }>(queryEndpoint);
      return res;
    },
    retry: false,
    refetchInterval: 10_000,
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

  const replyMutation = useMutation({
    mutationFn: async (payload: { body: string; assetIds: string[] }) => {
      const endpoint = isAdmin
        ? `/api/admin/tickets/${ticketId}/reply`
        : `/api/support/tickets/${ticketId}`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.message || "Gagal mengirim balasan.");
      }
      return json;
    },
    onSuccess: () => {
      setReplyBody("");
      setAttachments([]);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["admin", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "nav-counts"] });
      queryClient.invalidateQueries({ queryKey: ["support", "unread-count"] });
      toast.success("Balasan terkirim.");
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Gagal mengirim balasan.",
      );
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async () => {
      const endpoint = isAdmin
        ? `/api/admin/tickets/${ticketId}/resolve`
        : `/api/support/tickets/${ticketId}/resolve`;

      const response = await fetch(endpoint, {
        method: "POST",
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.message || "Gagal menyelesaikan tiket.");
      }
      return json;
    },
    onSuccess: () => {
      toast.success("Tiket telah diselesaikan.");
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["admin", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "nav-counts"] });
      queryClient.invalidateQueries({ queryKey: ["support", "unread-count"] });
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Gagal menyelesaikan tiket.",
      );
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async () => {
      const endpoint = isAdmin
        ? `/api/admin/tickets/${ticketId}/reopen`
        : `/api/support/tickets/${ticketId}/reopen`;

      const response = await fetch(endpoint, {
        method: "POST",
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.message || "Gagal membuka kembali tiket.");
      }
      return json;
    },
    onSuccess: () => {
      toast.success("Tiket telah dibuka kembali.");
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["admin", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "nav-counts"] });
      queryClient.invalidateQueries({ queryKey: ["support", "unread-count"] });
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Gagal membuka kembali tiket.",
      );
    },
  });

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
    const timer = setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop =
          messagesContainerRef.current.scrollHeight;
      }
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }, 50);
    return () => clearTimeout(timer);
  }, [data?.ticket?.messages]);

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

      setAttachments((prev) => [
        ...prev,
        { id: localId, url: localUrl, file, uploading: true },
      ]);

      try {
        const result = await uploadMutation.mutateAsync(file);
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
        setAttachments((prev) => prev.filter((item) => item.id !== localId));
      }
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanBody = replyBody.trim();
    const assetIds = attachments
      .filter((item) => !item.uploading)
      .map((item) => item.id);

    if (!cleanBody && assetIds.length === 0) {
      return;
    }

    replyMutation.mutate({
      body: cleanBody,
      assetIds,
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-[50dvh] items-center justify-center text-[#5f5f5d] dark:text-surface-warm-white/60">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (error || !data?.ticket) {
    return (
      <div className="mx-auto max-w-2xl px-spacing-4 py-spacing-8 text-center text-[#1c1c1c] dark:text-surface-warm-white">
        <h2 className="text-lg font-semibold">Tiket Tidak Ditemukan</h2>
        <p className="mt-2 text-sm text-[#5f5f5d] dark:text-surface-warm-white/60">
          Pastikan Anda memiliki akses dan ID tiket valid.
        </p>
        <Link
          href={backUrl}
          className="mt-4 inline-block text-sm text-accent-orange underline underline-offset-4"
        >
          Kembali
        </Link>
      </div>
    );
  }

  const { ticket } = data;
  const shortId = ticket.id.slice(-8).toUpperCase();
  const isOpen = ticket.status === "OPEN";
  const statusDisplay = ticketStatusDisplay(ticket.status);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden text-[#1c1c1c] dark:text-surface-warm-white">
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-spacing-2 border-b border-black/10 pb-3 pt-2 dark:border-surface-warm-white/10">
        <div className="flex items-center justify-between gap-spacing-3">
          <div className="flex items-center gap-spacing-3 min-w-0 flex-1">
            <Link
              href={backUrl}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-transparent text-[#5f5f5d] transition-colors hover:border-black/20 hover:bg-black/[0.04] hover:text-[#1c1c1c] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/50 dark:border-white/14 dark:bg-transparent dark:text-surface-warm-white dark:hover:bg-white/[0.06] dark:focus-visible:ring-white/50"
              title="Kembali"
              aria-label="Kembali"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold sm:text-lg">
                {ticket.subject}
              </h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-spacing-2 gap-y-spacing-1 text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
                <span className="font-mono text-[#5f5f5d]/80 dark:text-surface-warm-white/50">
                  #{shortId}
                </span>
                <span>•</span>
                <span>{CATEGORY_LABELS[ticket.category]}</span>
                {ticket.user?.email && (
                  <>
                    <span>•</span>
                    <SensitiveText
                      value={ticket.user.email}
                      kind="email"
                      className="font-mono"
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <AdminStatusBadge tone={statusDisplay.tone}>
              {statusDisplay.label}
            </AdminStatusBadge>

            {isOpen ? (
              <Button
                onClick={() => resolveMutation.mutate()}
                size="sm"
                variant="outline"
                className="h-8 rounded-lg border-black/15 bg-white px-3 text-xs font-semibold text-foreground hover:bg-black/5 hover:text-foreground dark:border-white/15 dark:bg-white/5 dark:text-surface-warm-white dark:hover:bg-white/10 dark:hover:text-white cursor-pointer"
                disabled={resolveMutation.isPending}
              >
                {resolveMutation.isPending ? "Memproses..." : "Tandai Selesai"}
              </Button>
            ) : (
              <Button
                onClick={() => reopenMutation.mutate()}
                size="sm"
                variant="outline"
                className="h-8 rounded-lg border-accent-orange/30 bg-accent-orange/10 px-3 text-xs font-semibold text-accent-orange hover:bg-accent-orange/20 dark:border-accent-orange/40 dark:bg-accent-orange/15 dark:text-accent-orange cursor-pointer"
                disabled={reopenMutation.isPending}
              >
                {reopenMutation.isPending ? "Membuka..." : "Buka Kembali"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto py-4 space-y-3 px-1 sm:px-2 min-h-0 [overscroll-behavior:contain]"
      >
        {ticket.messages.map((msg) => {
          // Align right if message is by current role viewing
          const isOwn = isAdmin
            ? msg.authorRole === "admin"
            : msg.authorRole === "user";
          const isUserRole = msg.authorRole === "user";

          return (
            <div
              key={msg.id}
              className={`flex max-w-[85%] sm:max-w-[75%] flex-col ${isOwn ? "items-end ml-auto" : "items-start mr-auto"}`}
            >
              <div
                className={`rounded-2xl px-4 py-3 text-sm shadow-2xs ${
                  isOwn
                    ? "rounded-tr-none bg-accent-orange text-white"
                    : isUserRole
                      ? "rounded-tl-none border border-black/10 bg-white text-[#1c1c1c] dark:border-surface-warm-white/10 dark:bg-surface-warm-white/5 dark:text-surface-warm-white"
                      : "rounded-tl-none border border-accent-orange-border bg-accent-orange-subtle text-[#1c1c1c] dark:border-accent-orange-border dark:bg-accent-orange-subtle dark:text-surface-warm-white"
                }`}
              >
                {msg.body ? (
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {msg.body}
                  </div>
                ) : null}

                {msg.assetIds && msg.assetIds.length > 0 && (
                  <div
                    className={`${msg.body ? "mt-2.5" : ""} flex flex-wrap gap-2`}
                  >
                    {msg.assetIds.map((assetId, assetIdx) => (
                      <button
                        key={assetId}
                        type="button"
                        onClick={() => {
                          setLightboxImages(
                            msg.assetIds.map((id, i) => ({
                              src: `/api/support/assets/${id}`,
                              alt: `Lampiran ${i + 1}`,
                            })),
                          );
                          setLightboxIndex(assetIdx);
                          setLightboxOpen(true);
                        }}
                        className="block overflow-hidden rounded-xl border border-black/10 bg-black/5 dark:border-surface-warm-white/10 shadow-2xs cursor-pointer text-left"
                      >
                        <img
                          src={`/api/support/assets/${assetId}`}
                          alt="Lampiran"
                          className="size-24 sm:size-28 object-cover transition hover:scale-105"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div
                className={`mt-1 flex items-center gap-1 text-[10px] text-[#5f5f5d] dark:text-surface-warm-white/50 ${
                  isOwn ? "justify-end pr-1" : "justify-start pl-1"
                }`}
              >
                <span>
                  {isUserRole
                    ? isAdmin
                      ? "User"
                      : "Anda"
                    : isAdmin
                      ? "Anda (Admin)"
                      : "Tim Dukungan"}
                </span>
                <span>•</span>
                <span>
                  {new Date(msg.createdAt).toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Sticky Bottom Reply Input */}
      {isOpen || isAdmin ? (
        <form
          onSubmit={handleSend}
          className="sticky bottom-0 z-10 shrink-0 border-t border-black/10 bg-[#eceae4]/95 backdrop-blur-md pt-3 pb-2 dark:border-surface-warm-white/10 dark:bg-[#151515]/95"
        >
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-2">
              {attachments.map((item, idx) => (
                <ImageUploadThumb
                  alt="Attachment preview"
                  className="size-14 rounded-xl overflow-hidden shadow-2xs cursor-pointer"
                  key={item.id}
                  onClick={() => {
                    setLightboxImages(
                      attachments.map((a, i) => ({
                        src: a.url,
                        alt: `Pratinjau ${i + 1}`,
                      })),
                    );
                    setLightboxIndex(idx);
                    setLightboxOpen(true);
                  }}
                  onRemove={() => removeAttachment(item.id)}
                  src={item.url}
                  uploading={item.uploading}
                />
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            {attachments.length < 3 && (
              <label
                className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-black/15 bg-white text-[#5f5f5d] transition hover:bg-black/5 dark:border-surface-warm-white/15 dark:bg-white/[0.04] dark:text-surface-warm-white/60 dark:hover:bg-white/10 shadow-2xs"
                title="Lampirkan gambar (maks 3)"
              >
                <ImagePlus className="size-5" />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            )}

            <input
              type="text"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder={
                isAdmin
                  ? isOpen
                    ? "Tulis balasan sebagai admin…"
                    : "Balas dan buka kembali tiket ini…"
                  : "Tulis balasan Anda…"
              }
              className="h-11 flex-1 rounded-xl border border-black/15 bg-white px-3.5 text-sm text-[#1c1c1c] outline-none placeholder:text-[#5f5f5d]/60 focus:border-accent-orange focus:ring-1 focus:ring-accent-orange dark:border-surface-warm-white/15 dark:bg-white/[0.04] dark:text-surface-warm-white dark:placeholder:text-surface-warm-white/40 shadow-2xs"
            />

            <Button
              type="submit"
              size="sm"
              className="flex h-11 shrink-0 items-center gap-2 rounded-xl px-4 font-bold shadow-sm"
              disabled={
                (!replyBody.trim() && attachments.length === 0) ||
                attachments.some((item) => item.uploading) ||
                replyMutation.isPending
              }
            >
              <Send className="size-4" />
              <span className="hidden sm:inline">
                {isAdmin ? (isOpen ? "Balas" : "Balas & Buka") : "Kirim"}
              </span>
            </Button>
          </div>
        </form>
      ) : (
        <div className="shrink-0 border-t border-black/10 py-3 text-center text-xs text-[#5f5f5d] dark:border-surface-warm-white/10 dark:text-surface-warm-white/40">
          Tiket ini telah selesai ditangani.
        </div>
      )}

      <ImageLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        images={lightboxImages}
        initialIndex={lightboxIndex}
      />
    </div>
  );
}

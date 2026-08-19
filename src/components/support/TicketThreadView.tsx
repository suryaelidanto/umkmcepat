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

  const queryEndpoint = isAdmin
    ? `/api/admin/tickets/${ticketId}`
    : `/api/support/tickets/${ticketId}`;
  const queryKey = isAdmin
    ? ["admin", "tickets", ticketId]
    : ["support", "tickets", ticketId];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchJson<{ ticket: TicketDetail }>(queryEndpoint),
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
        : `/api/support/tickets/${ticketId}/reply`;

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
      if (isAdmin) {
        queryClient.invalidateQueries({ queryKey: ["admin", "nav-counts"] });
      } else {
        queryClient.invalidateQueries({
          queryKey: ["support", "unread-count"],
        });
      }
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
      if (isAdmin) {
        queryClient.invalidateQueries({ queryKey: ["admin", "nav-counts"] });
      } else {
        queryClient.invalidateQueries({
          queryKey: ["support", "unread-count"],
        });
      }
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Gagal menyelesaikan tiket.",
      );
    },
  });

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
  const lastMsg = ticket.messages[ticket.messages.length - 1];
  const canResolve =
    isOpen && (isAdmin || (lastMsg && lastMsg.authorRole === "user"));
  const statusDisplay = ticketStatusDisplay(ticket.status);

  return (
    <div className="flex h-[calc(100dvh-7rem)] w-full flex-col text-[#1c1c1c] dark:text-surface-warm-white">
      {/* Header */}
      <div className="flex flex-col gap-spacing-2 border-b border-black/10 pb-spacing-4 dark:border-surface-warm-white/10">
        <div className="flex items-center justify-between gap-spacing-3">
          <div className="flex items-center gap-spacing-3 min-w-0 flex-1">
            <Link
              href={backUrl}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white text-[#1c1c1c] transition hover:bg-black/5 dark:border-surface-warm-white/10 dark:bg-white/[0.04] dark:text-surface-warm-white dark:hover:bg-white/10"
              title="Kembali"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold sm:text-lg">
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

          <div className="flex shrink-0 items-center gap-spacing-2">
            <AdminStatusBadge tone={statusDisplay.tone}>
              {statusDisplay.label}
            </AdminStatusBadge>

            {canResolve && (
              <Button
                onClick={() => resolveMutation.mutate()}
                size="sm"
                variant="outline"
                className="text-xs"
                disabled={resolveMutation.isPending}
              >
                {resolveMutation.isPending ? "Memproses..." : "Tandai Selesai"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="scrollbar-thin flex flex-1 flex-col gap-spacing-4 overflow-y-auto py-spacing-4 pr-1">
        {ticket.messages.map((msg) => {
          // Align right if message is by current role viewing
          const isOwn = isAdmin
            ? msg.authorRole === "admin"
            : msg.authorRole === "user";
          const isUserRole = msg.authorRole === "user";

          return (
            <div
              key={msg.id}
              className={`flex max-w-[85%] flex-col ${isOwn ? "items-end self-end" : "items-start self-start"}`}
            >
              <div
                className={`rounded-2xl px-spacing-4 py-spacing-3 text-sm shadow-2xs ${
                  isOwn
                    ? "rounded-tr-none bg-accent-orange text-white dark:bg-accent-orange dark:text-white"
                    : isUserRole
                      ? "rounded-tl-none border border-black/10 bg-white text-[#1c1c1c] dark:border-surface-warm-white/10 dark:bg-surface-warm-white/5 dark:text-surface-warm-white"
                      : "rounded-tl-none border border-accent-orange-border bg-accent-orange-subtle text-[#1c1c1c] dark:border-accent-orange-border dark:bg-accent-orange-subtle dark:text-surface-warm-white"
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed">
                  {msg.body}
                </div>

                {msg.assetIds && msg.assetIds.length > 0 && (
                  <div className="mt-spacing-3 flex flex-wrap gap-spacing-2">
                    {msg.assetIds.map((assetId) => (
                      <a
                        key={assetId}
                        href={`/api/support/assets/${assetId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block overflow-hidden rounded-radius-md border border-black/10 bg-black/5 dark:border-surface-warm-white/10"
                      >
                        <img
                          src={`/api/support/assets/${assetId}`}
                          alt="Lampiran"
                          className="size-20 object-cover transition hover:scale-105"
                        />
                      </a>
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

      {/* Reply Input */}
      {isOpen ? (
        <form
          onSubmit={handleSend}
          className="mt-auto flex flex-col gap-spacing-2 border-t border-black/10 pt-spacing-4 dark:border-surface-warm-white/10"
        >
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-spacing-2">
              {attachments.map((item) => (
                <ImageUploadThumb
                  alt="Attachment preview"
                  className="size-14"
                  key={item.id}
                  onRemove={() => removeAttachment(item.id)}
                  src={item.url}
                  uploading={item.uploading}
                />
              ))}
            </div>
          )}

          <div className="flex items-center gap-spacing-2">
            {attachments.length < 3 && (
              <label
                className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-radius-md border border-black/15 bg-white text-[#5f5f5d] transition hover:bg-black/5 dark:border-surface-warm-white/15 dark:bg-white/[0.04] dark:text-surface-warm-white/60 dark:hover:bg-white/10"
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
                isAdmin ? "Tulis balasan sebagai admin…" : "Tulis balasan Anda…"
              }
              className="h-10 flex-1 rounded-radius-md border border-black/15 bg-white px-spacing-3 text-sm text-[#1c1c1c] outline-none placeholder:text-black/40 focus:border-accent-orange focus:ring-1 focus:ring-accent-orange dark:border-surface-warm-white/15 dark:bg-white/[0.04] dark:text-surface-warm-white dark:placeholder:text-surface-warm-white/40"
            />

            <Button
              type="submit"
              size="sm"
              className="flex h-10 shrink-0 items-center gap-2"
              disabled={
                (!replyBody.trim() && attachments.length === 0) ||
                attachments.some((item) => item.uploading) ||
                replyMutation.isPending
              }
            >
              <Send className="size-4" />
              <span className="hidden sm:inline">
                {isAdmin ? "Balas" : "Kirim"}
              </span>
            </Button>
          </div>
        </form>
      ) : (
        <div className="border-t border-black/10 py-spacing-4 text-center text-xs text-[#5f5f5d] dark:border-surface-warm-white/10 dark:text-surface-warm-white/40">
          Tiket ini telah selesai ditangani.
        </div>
      )}
    </div>
  );
}

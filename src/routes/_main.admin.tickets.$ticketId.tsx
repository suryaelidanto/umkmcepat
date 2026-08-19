import { SupportCategory, SupportTicketStatus } from "@prisma/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ImagePlus, Loader2, Send } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

import { ticketStatusDisplay } from "@/components/admin/status/admin-status";
import { AdminStatusBadge } from "@/components/admin/status/AdminStatusBadge";
import { SensitiveText } from "@/components/admin/streamer-mode/SensitiveText";
import { Button } from "@/components/ui/button";
import { ImageUploadThumb } from "@/components/ui/image-upload-thumb";
import { Link } from "@/components/ui/link";
import { fetchJson } from "@/lib/query-client";

export const Route = createFileRoute("/_main/admin/tickets/$ticketId")({
  component: AdminTicketThreadPage,
});

type Message = {
  id: string;
  authorId: string;
  authorRole: "user" | "admin";
  body: string;
  createdAt: string;
  assetIds: string[];
};

type TicketDetail = {
  id: string;
  subject: string;
  category: SupportCategory;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string | null;
    name: string | null;
  };
  messages: Message[];
};

const CATEGORY_LABELS: Record<SupportCategory, string> = {
  TEKNIS: "Masalah Teknis",
  PEMBAYARAN: "Pembayaran & Kuota",
  UMUM: "Pertanyaan Umum",
};

function AdminTicketThreadPage() {
  const { ticketId } = Route.useParams();
  const queryClient = useQueryClient();
  const [replyBody, setReplyBody] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Attachments state
  const [attachments, setAttachments] = useState<
    Array<{ id: string; url: string; file: File; uploading: boolean }>
  >([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "tickets", ticketId],
    queryFn: () =>
      fetchJson<{ ticket: TicketDetail }>(`/api/admin/tickets/${ticketId}`),
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

  const replyMutation = useMutation({
    mutationFn: async (payload: { body: string; assetIds: string[] }) => {
      const response = await fetch(`/api/admin/tickets/${ticketId}/reply`, {
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
      queryClient.invalidateQueries({
        queryKey: ["admin", "tickets", ticketId],
      });
      queryClient.invalidateQueries({
        queryKey: ["admin", "nav-counts"],
      });
      toast.success("Balasan berhasil dikirim.");
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Gagal mengirim balasan.",
      );
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/admin/tickets/${ticketId}/resolve`, {
        method: "POST",
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.message || "Gagal menyelesaikan tiket.");
      }
      return json;
    },
    onSuccess: () => {
      toast.success("Tiket diselesaikan.");
      queryClient.invalidateQueries({
        queryKey: ["admin", "tickets", ticketId],
      });
      queryClient.invalidateQueries({
        queryKey: ["admin", "nav-counts"],
      });
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Gagal menyelesaikan tiket.",
      );
    },
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.ticket?.messages]);

  if (isLoading) {
    return (
      <div className="flex h-[50dvh] items-center justify-center text-surface-warm-white">
        <Loader2 className="size-6 animate-spin text-surface-warm-white/60" />
      </div>
    );
  }

  if (error || !data?.ticket) {
    return (
      <div className="py-spacing-8 text-center text-surface-warm-white">
        <h2 className="text-lg font-semibold">Tiket Tidak Ditemukan</h2>
        <Link
          href="/admin/tickets"
          className="mt-4 inline-block text-sm text-aurora-orange underline"
        >
          Kembali ke Daftar Tiket
        </Link>
      </div>
    );
  }

  const { ticket } = data;
  const shortId = ticket.id.slice(-8).toUpperCase();
  const isOpen = ticket.status === "OPEN";

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
    if (!replyBody.trim()) {
      return;
    }

    const assetIds = attachments
      .filter((item) => !item.uploading)
      .map((item) => item.id);
    replyMutation.mutate({
      body: replyBody,
      assetIds,
    });
  };

  return (
    <div className="flex h-[80dvh] w-full flex-col pb-20 text-[#1c1c1c] dark:text-surface-warm-white">
      {/* Header */}
      <div className="flex flex-col gap-spacing-2 border-b border-black/10 pb-spacing-4 dark:border-surface-warm-white/10">
        <div className="flex items-center gap-spacing-3">
          <Link
            href="/admin/tickets"
            className="text-[#5f5f5d] hover:text-[#1c1c1c] dark:text-surface-warm-white/60 dark:hover:text-surface-warm-white"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-md truncate font-semibold">{ticket.subject}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-spacing-2 gap-y-spacing-1 text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
              <span className="font-mono text-[#5f5f5d]/70 dark:text-surface-warm-white/40">
                #{shortId}
              </span>
              <span>•</span>
              <span>{CATEGORY_LABELS[ticket.category]}</span>
              <span>•</span>
              <SensitiveText
                value={ticket.user.email}
                kind="email"
                className="font-mono"
              />
            </div>
          </div>
        </div>

        <div className="mt-spacing-2 flex items-center justify-between">
          {(() => {
            const display = ticketStatusDisplay(ticket.status);
            return (
              <AdminStatusBadge tone={display.tone}>
                {display.label}
              </AdminStatusBadge>
            );
          })()}

          {isOpen && (
            <Button
              onClick={() => resolveMutation.mutate()}
              size="sm"
              variant="outline"
              className="text-xs"
            >
              Tandai Selesai
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="scrollbar-thin flex flex-1 flex-col gap-spacing-4 overflow-y-auto py-spacing-4">
        {ticket.messages.map((msg) => {
          const isUser = msg.authorRole === "user";
          return (
            <div
              key={msg.id}
              className={`flex max-w-[85%] flex-col ${isUser ? "items-start self-start" : "items-end self-end"}`}
            >
              <div
                className={`rounded-radius-lg px-spacing-4 py-spacing-5 text-base ${
                  isUser
                    ? "rounded-tl-none border border-black/10 bg-[#fcfbf8] text-[#1c1c1c] dark:border-surface-warm-white/10 dark:bg-[#1c1c1c] dark:text-surface-warm-white"
                    : "rounded-tr-none bg-black/5 text-[#1c1c1c] dark:bg-surface-warm-white/10 dark:text-surface-warm-white"
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
                        className="block overflow-hidden rounded-radius-md border border-black/10 dark:border-surface-warm-white/10"
                      >
                        <img
                          src={`/api/support/assets/${assetId}`}
                          alt="Attachment"
                          className="h-16 w-16 object-cover transition hover:opacity-80"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <span className="mt-spacing-1.5 px-1 text-[10px] text-[#5f5f5d] dark:text-surface-warm-white/40">
                {isUser ? "User" : "Admin"} •{" "}
                {new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply input */}
      {isOpen ? (
        <form
          onSubmit={handleSend}
          className="flex flex-col gap-spacing-3 border-t border-black/10 pt-spacing-4 dark:border-surface-warm-white/10"
        >
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-spacing-2 px-1">
              {attachments.map((item) => (
                <ImageUploadThumb
                  alt="Thumbnail preview"
                  className="size-12"
                  key={item.id}
                  onRemove={() => removeAttachment(item.id)}
                  src={item.url}
                  uploading={item.uploading}
                />
              ))}
            </div>
          )}

          <div className="flex items-center gap-spacing-3">
            {attachments.length < 3 && (
              <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-radius-md border border-black/10 bg-black/[0.02] text-[#5f5f5d] hover:bg-black/5 dark:border-surface-warm-white/10 dark:bg-surface-warm-white/5 dark:text-surface-warm-white/60 dark:hover:bg-surface-warm-white/10">
                <ImagePlus className="size-5" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  multiple
                  onChange={handleFileChange}
                />
              </label>
            )}

            <input
              type="text"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Tulis balasan sebagai admin..."
              className="h-10 flex-1 rounded-radius-md border border-black/10 bg-transparent px-spacing-3 text-sm text-[#1c1c1c] outline-none focus:ring-1 focus:ring-aurora-orange dark:border-surface-warm-white/10 dark:text-surface-warm-white"
            />

            <Button
              type="submit"
              size="sm"
              className="flex h-10 shrink-0 items-center gap-2"
              disabled={
                !replyBody.trim() || attachments.some((item) => item.uploading)
              }
            >
              <Send className="size-4" />
              <span>Balas</span>
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

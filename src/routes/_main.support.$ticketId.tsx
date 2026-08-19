import { SupportCategory, SupportTicketStatus } from "@prisma/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowLeft, ImagePlus, Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ImageUploadThumb } from "@/components/ui/image-upload-thumb";
import { Link } from "@/components/ui/link";
import { auth } from "@/lib/auth/auth";
import { fetchJson } from "@/lib/query-client";

const requireAuth = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    throw redirect({ to: "/" });
  }
  return { ok: true };
});

export const Route = createFileRoute("/_main/support/$ticketId")({
  beforeLoad: async () => {
    await requireAuth();
  },
  component: TicketThreadPage,
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
  messages: Message[];
};

const CATEGORY_LABELS: Record<SupportCategory, string> = {
  TEKNIS: "Masalah Teknis",
  PEMBAYARAN: "Pembayaran & Kuota",
  UMUM: "Pertanyaan Umum",
};

function TicketThreadPage() {
  const { ticketId } = Route.useParams();
  const queryClient = useQueryClient();
  const [replyBody, setReplyBody] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Attachments state
  const [attachments, setAttachments] = useState<
    Array<{ id: string; url: string; file: File; uploading: boolean }>
  >([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["support", "tickets", ticketId],
    queryFn: () =>
      fetchJson<{ ticket: TicketDetail }>(`/api/support/tickets/${ticketId}`),
    refetchInterval: 10000, // Poll every 10s to see admin replies
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
      const response = await fetch(`/api/support/tickets/${ticketId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.message || "Gagal mengirim pesan.");
      }
      return json;
    },
    onSuccess: () => {
      setReplyBody("");
      setAttachments([]);
      queryClient.invalidateQueries({
        queryKey: ["support", "tickets", ticketId],
      });
      queryClient.invalidateQueries({ queryKey: ["support", "unread-count"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim pesan.");
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/support/tickets/${ticketId}/resolve`, {
        method: "POST",
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.message || "Gagal menyelesaikan tiket.");
      }
      return json;
    },
    onSuccess: () => {
      toast.success("Tiket telah ditandai selesai.");
      queryClient.invalidateQueries({
        queryKey: ["support", "tickets", ticketId],
      });
      queryClient.invalidateQueries({ queryKey: ["support", "unread-count"] });
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

  if (isLoading) {
    return (
      <div className="flex h-[50dvh] items-center justify-center text-surface-warm-white">
        <Loader2 className="size-6 animate-spin text-surface-warm-white/60" />
      </div>
    );
  }

  if (error || !data?.ticket) {
    return (
      <div className="mx-auto max-w-2xl px-spacing-4 py-spacing-8 text-center text-surface-warm-white">
        <h2 className="text-lg font-semibold">Tiket Tidak Ditemukan</h2>
        <p className="mt-2 text-sm text-surface-warm-white/60">
          Pastikan Anda memiliki akses dan ID tiket valid.
        </p>
        <Link
          href="/support"
          className="mt-4 inline-block text-sm text-accent-orange underline"
        >
          Kembali ke Bantuan
        </Link>
      </div>
    );
  }

  const { ticket } = data;
  const shortId = ticket.id.slice(-8).toUpperCase();
  const lastMsg = ticket.messages[ticket.messages.length - 1];
  const canResolve =
    ticket.status === "OPEN" && lastMsg && lastMsg.authorRole === "user";

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
    <main className="mx-auto flex h-dvh w-full max-w-7xl flex-col px-3 pb-20 pt-6 text-surface-warm-white sm:px-6 lg:px-8">
      <div className="flex h-full w-full flex-col">
        {/* Header */}
        <div className="flex flex-col gap-spacing-2 border-b border-surface-warm-white/10 pb-spacing-4">
          <div className="flex items-center gap-spacing-3">
            <Link
              href="/support"
              className="text-surface-warm-white/60 hover:text-surface-warm-white"
            >
              <ArrowLeft className="size-5" />
            </Link>
            <div>
              <h1 className="text-md font-semibold line-clamp-1">
                {ticket.subject}
              </h1>
              <div className="flex items-center gap-spacing-2 mt-1">
                <span className="text-xs font-mono text-surface-warm-white/40">
                  #{shortId}
                </span>
                <span className="text-xs text-surface-warm-white/60">•</span>
                <span className="text-xs text-surface-warm-white/60">
                  {CATEGORY_LABELS[ticket.category]}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-spacing-2">
            <div className="flex items-center gap-spacing-2">
              <span
                className={`rounded-radius-sm border px-2 py-0.5 text-[10px] font-bold ${
                  ticket.status === "OPEN"
                    ? "bg-accent-orange-subtle border-accent-orange-border text-accent-orange"
                    : "bg-surface-warm-white/10 text-surface-warm-white/50 border-transparent"
                }`}
              >
                {ticket.status === "OPEN" ? "BUKA" : "SELESAI"}
              </span>
            </div>

            {canResolve && (
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

        {/* Message Area */}
        <div className="flex-1 overflow-y-auto py-spacing-4 flex flex-col gap-spacing-4 scrollbar-thin">
          {ticket.messages.map((msg) => {
            const isUser = msg.authorRole === "user";
            return (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[85%] ${isUser ? "self-end items-end" : "self-start items-start"}`}
              >
                {/* Message Bubble */}
                <div
                  className={`rounded-radius-lg px-spacing-4 py-spacing-5 text-base ${
                    isUser
                      ? "bg-surface-warm-white/10 text-surface-warm-white rounded-tr-none"
                      : "bg-[#1c1c1c] border border-surface-warm-white/10 text-surface-warm-white rounded-tl-none"
                  }`}
                >
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {msg.body}
                  </div>

                  {/* Attachments */}
                  {msg.assetIds && msg.assetIds.length > 0 && (
                    <div className="flex flex-wrap gap-spacing-2 mt-spacing-3">
                      {msg.assetIds.map((assetId) => (
                        <a
                          key={assetId}
                          href={`/api/support/assets/${assetId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-radius-md overflow-hidden border border-surface-warm-white/10"
                        >
                          <img
                            src={`/api/support/assets/${assetId}`}
                            alt="Attachment"
                            className="h-16 w-16 object-cover hover:opacity-80 transition"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <span className="text-[10px] text-surface-warm-white/40 mt-spacing-1.5 px-1">
                  {isUser ? "Anda" : "Admin"} •{" "}
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

        {/* Footer compose area */}
        {ticket.status === "OPEN" ? (
          <form
            onSubmit={handleSend}
            className="border-t border-surface-warm-white/10 bg-[#171715] pt-spacing-4 flex flex-col gap-spacing-3"
          >
            {/* Previews if any */}
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
                <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 text-surface-warm-white/60 hover:bg-surface-warm-white/10">
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
                placeholder="Tulis balasan..."
                className="h-10 flex-1 rounded-radius-md border border-surface-warm-white/10 bg-transparent px-spacing-3 text-sm outline-none focus:border-accent-orange focus:ring-1 focus:ring-accent-orange"
              />

              <Button
                type="submit"
                size="sm"
                className="h-10 shrink-0 flex items-center gap-2"
                disabled={
                  !replyBody.trim() ||
                  attachments.some((item) => item.uploading)
                }
              >
                <Send className="size-4" />
                <span className="hidden sm:inline">Kirim</span>
              </Button>
            </div>
          </form>
        ) : (
          <div className="border-t border-surface-warm-white/10 py-spacing-4 text-center text-xs text-surface-warm-white/40">
            Tiket ini telah selesai ditangani. Buat tiket baru jika Anda
            memiliki kendala lainnya.
          </div>
        )}
      </div>
    </main>
  );
}

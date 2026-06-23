"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  ArrowUp,
  CheckCircle2,
  Code2,
  Globe2,
  Loader2,
  Monitor,
  Smartphone,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { ProjectSitePreview } from "@/components/projects/renderer/ProjectSitePreview";
import { Button } from "@/components/ui/button";
import { type ProjectSiteSchema } from "@/lib/projects/site-schema";

type WorkspaceShellProps = {
  projectId: string;
  initialPrompt?: string;
  initialStatus: string;
  initialMessages: UIMessage[];
  siteSchema: ProjectSiteSchema;
};

type BuildProgress = {
  label: string;
  detail: string;
};

export function WorkspaceShell({
  projectId,
  initialPrompt = "",
  initialStatus,
  initialMessages,
  siteSchema: initialSiteSchema,
}: WorkspaceShellProps) {
  const [mode, setMode] = useState<"build" | "discuss">(
    initialStatus === "discussing" ? "discuss" : "build",
  );
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [message, setMessage] = useState("");
  const [siteSchema, setSiteSchema] = useState(initialSiteSchema);
  const [buildStatus, setBuildStatus] = useState(initialStatus);
  const [buildProgress, setBuildProgress] = useState<BuildProgress[]>([]);
  const [buildError, setBuildError] = useState("");
  const prompt = initialPrompt.trim();
  const hasStartedChat = useRef(false);
  const hasStartedBuild = useRef(false);
  const modeRef = useRef(mode);
  const { messages, sendMessage, status, error } = useChat({
    id: projectId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/projects/preview",
      prepareSendMessagesRequest({ messages }) {
        return {
          body: {
            message: messages[messages.length - 1],
            mode: modeRef.current,
            projectId,
          },
        };
      },
    }),
  });

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const startBuild = useCallback(async () => {
    if (buildStatus === "building") {
      return;
    }

    setBuildError("");
    setBuildStatus("building");
    setBuildProgress([]);

    const response = await fetch(`/api/projects/${projectId}/generate`, {
      method: "POST",
    });

    if (!response.ok || !response.body) {
      const result = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setBuildStatus("draft");
      setBuildError(result?.message || "AI belum bisa membangun website ini.");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const rawEvent of events) {
        const eventName = rawEvent.match(/^event: (.+)$/m)?.[1];
        const dataText = rawEvent.match(/^data: (.+)$/m)?.[1];

        if (!eventName || !dataText) {
          continue;
        }

        const data = JSON.parse(dataText) as
          | ProjectSiteSchema
          | BuildProgress
          | {
              message?: string;
            };

        if (eventName === "progress") {
          setBuildProgress((items) => [...items, data as BuildProgress]);
        }

        if (eventName === "schema" || eventName === "done") {
          setSiteSchema(data as ProjectSiteSchema);
        }

        if (eventName === "done") {
          setBuildStatus("ready");
        }

        if (eventName === "error") {
          setBuildStatus("draft");
          setBuildError(
            (data as { message?: string }).message ||
              "AI belum bisa membangun website ini.",
          );
        }
      }
    }
  }, [buildStatus, projectId]);

  useEffect(() => {
    if (
      hasStartedBuild.current ||
      initialStatus === "ready" ||
      initialStatus === "discussing"
    ) {
      return;
    }

    hasStartedBuild.current = true;
    void startBuild();
  }, [initialStatus, startBuild]);

  useEffect(() => {
    if (hasStartedChat.current || !prompt) {
      return;
    }

    hasStartedChat.current = true;
    sendMessage({ text: prompt }, { body: { mode } });
  }, [mode, prompt, sendMessage]);

  function switchMode(nextMode: "build" | "discuss") {
    setMode(nextMode);

    if (nextMode === "build" && buildStatus === "discussing") {
      void startBuild();
    }
  }

  function handleMessageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();

    if (!text || status === "submitted" || status === "streaming") {
      return;
    }

    setMessage("");
    sendMessage({ text }, { body: { mode } });
  }

  const isResponding = status === "submitted" || status === "streaming";
  const isBuilding = buildStatus === "building";

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#151515] text-surface-warm-white">
      <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-[1440px] gap-spacing-7 px-4 py-spacing-7 lg:grid-cols-[420px_1fr] lg:px-spacing-9">
        <aside className="flex min-h-[520px] flex-col rounded-[28px] border border-surface-warm-white/10 bg-[#1f1f1d] p-spacing-7 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
          <div className="flex items-center justify-between gap-spacing-7">
            <div>
              <p className="text-sm text-surface-warm-white/54">
                Website usahamu
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-[-0.04em]">
                Buat website
              </h1>
            </div>
            <div className="flex rounded-full border border-surface-warm-white/10 bg-surface-warm-white/6 p-1 text-sm">
              <button
                type="button"
                onClick={() => switchMode("build")}
                className={`rounded-full px-spacing-7 py-spacing-3 transition ${mode === "build" ? "bg-surface-warm-white text-foreground-primary" : "text-surface-warm-white/62 hover:text-surface-warm-white"}`}
              >
                Buat
              </button>
              <button
                type="button"
                onClick={() => switchMode("discuss")}
                className={`rounded-full px-spacing-7 py-spacing-3 transition ${mode === "discuss" ? "bg-surface-warm-white text-foreground-primary" : "text-surface-warm-white/62 hover:text-surface-warm-white"}`}
              >
                Diskusi
              </button>
            </div>
          </div>

          <div className="mt-spacing-9 flex-1 space-y-spacing-7 overflow-y-auto pr-1">
            <div className="rounded-radius-2xl bg-surface-warm-white px-spacing-7 py-spacing-6 text-sm leading-6 text-foreground-primary">
              {prompt}
            </div>

            <div className="rounded-radius-2xl border border-surface-warm-white/10 bg-surface-warm-white/6 px-spacing-7 py-spacing-6 text-sm leading-6 text-surface-warm-white/76">
              {messages.length ? (
                <div className="space-y-spacing-4">
                  {messages
                    .filter((message) => message.role === "assistant")
                    .map((message) => (
                      <div key={message.id} className="whitespace-pre-wrap">
                        {message.parts.map((part, index) =>
                          part.type === "text" ? (
                            <span key={index}>{part.text}</span>
                          ) : null,
                        )}
                      </div>
                    ))}
                </div>
              ) : (
                "AI sedang membaca brief dan menyiapkan struktur website."
              )}
              {isResponding ? (
                <p className="mt-spacing-4 text-xs text-surface-warm-white/46">
                  AI sedang menyiapkan jawaban...
                </p>
              ) : null}
              {error ? (
                <p className="mt-spacing-4 text-xs text-[#ffb4a6]">
                  AI belum bisa menjawab. Coba lagi nanti.
                </p>
              ) : null}
            </div>

            <div className="rounded-radius-2xl border border-surface-warm-white/10 bg-[#171716] p-spacing-7">
              <div className="flex items-center justify-between gap-spacing-5 text-sm font-medium">
                <div className="flex items-center gap-spacing-5">
                  <Code2 className="size-4" aria-hidden="true" />
                  Proses build
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void startBuild()}
                  disabled={isBuilding}
                  className="h-8 border-surface-warm-white/16 bg-transparent text-xs text-surface-warm-white hover:bg-surface-warm-white/10"
                >
                  {isBuilding ? "Membangun..." : "Generate ulang"}
                </Button>
              </div>
              <ul className="mt-spacing-6 space-y-spacing-5 text-sm text-surface-warm-white/64">
                {buildProgress.length ? (
                  buildProgress.map((item, index) => (
                    <li
                      key={`${item.label}-${index}`}
                      className="flex gap-spacing-5"
                    >
                      {index === buildProgress.length - 1 && isBuilding ? (
                        <Loader2 className="mt-0.5 size-4 animate-spin text-[#ff5e27]" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 size-4 text-[#ff5e27]" />
                      )}
                      <span>
                        <span className="block text-surface-warm-white">
                          {item.label}
                        </span>
                        <span>{item.detail}</span>
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="flex gap-spacing-5">
                    <Loader2 className="mt-0.5 size-4 animate-spin text-[#ff5e27]" />
                    <span>Menunggu AI memulai build...</span>
                  </li>
                )}
              </ul>
              {buildError ? (
                <p className="mt-spacing-5 text-sm text-[#ffb4a6]">
                  {buildError}
                </p>
              ) : null}
            </div>
          </div>

          <form
            onSubmit={handleMessageSubmit}
            className="mt-spacing-7 rounded-[24px] border border-surface-warm-white/10 bg-[#232321] p-spacing-5"
          >
            <label htmlFor="workspace-message" className="sr-only">
              Pesan untuk AI
            </label>
            <textarea
              id="workspace-message"
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={isResponding}
              placeholder={
                mode === "build"
                  ? "Minta perubahan, contoh: buat lebih premium..."
                  : "Tulis kebutuhan usaha, pelanggan, atau tujuan websitemu..."
              }
              className="w-full resize-none bg-transparent px-spacing-4 py-spacing-4 text-sm leading-6 text-surface-warm-white outline-none placeholder:text-surface-warm-white/38 disabled:opacity-60"
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                size="icon"
                disabled={!message.trim() || isResponding}
                className="size-9 rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-50"
                aria-label="Kirim pesan"
              >
                <ArrowUp className="size-4" />
              </Button>
            </div>
          </form>
        </aside>

        <section className="rounded-[32px] border border-surface-warm-white/10 bg-[#eceae4] p-spacing-5 text-foreground-primary shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
          <div className="mb-spacing-5 flex flex-wrap items-center justify-between gap-spacing-5 rounded-[22px] bg-surface-warm-white px-spacing-5 py-spacing-4">
            <div className="flex items-center gap-spacing-4 text-sm font-medium">
              <Globe2 className="size-4" aria-hidden="true" />
              Preview website
            </div>
            <div className="flex rounded-full bg-surface-muted p-1 text-sm">
              <button
                type="button"
                onClick={() => setViewport("desktop")}
                className={`flex items-center gap-spacing-3 rounded-full px-spacing-6 py-spacing-3 transition ${viewport === "desktop" ? "bg-foreground-primary text-surface-warm-white" : "text-text-secondary hover:text-foreground-primary"}`}
              >
                <Monitor className="size-4" aria-hidden="true" />
                Komputer
              </button>
              <button
                type="button"
                onClick={() => setViewport("mobile")}
                className={`flex items-center gap-spacing-3 rounded-full px-spacing-6 py-spacing-3 transition ${viewport === "mobile" ? "bg-foreground-primary text-surface-warm-white" : "text-text-secondary hover:text-foreground-primary"}`}
              >
                <Smartphone className="size-4" aria-hidden="true" />
                HP
              </button>
            </div>
          </div>

          <div className="flex min-h-[760px] items-start justify-center overflow-auto rounded-[24px] bg-[#d8d3c8] p-spacing-5">
            {buildStatus === "discussing" ? (
              <div className="grid min-h-[520px] w-full max-w-3xl place-items-center rounded-[28px] bg-surface-warm-white p-spacing-10 text-center shadow-[0_18px_48px_rgba(28,28,28,0.12)]">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.16em] text-text-secondary">
                    Mode diskusi
                  </p>
                  <h2 className="mt-spacing-6 text-5xl font-semibold leading-none tracking-[-0.06em] text-foreground-primary">
                    Belum membuat website.
                  </h2>
                  <p className="mx-auto mt-spacing-7 max-w-lg text-lg leading-8 text-text-secondary">
                    AI hanya membantu merapikan kebutuhan usaha. Kalau arahnya
                    sudah jelas, pilih mode Buat untuk mulai membangun preview
                    website.
                  </p>
                  <Button
                    type="button"
                    onClick={() => switchMode("build")}
                    className="mt-spacing-9 rounded-radius-lg bg-foreground-primary px-spacing-9 text-surface-warm-white hover:bg-foreground-primary/90"
                  >
                    Mulai buat website
                  </Button>
                </div>
              </div>
            ) : (
              <ProjectSitePreview siteSchema={siteSchema} viewport={viewport} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

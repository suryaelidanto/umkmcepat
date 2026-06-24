"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  FileCode2,
  Globe2,
  Loader2,
  Monitor,
  PanelRightClose,
  PanelRightOpen,
  Smartphone,
} from "lucide-react";
import {
  FormEvent,
  PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { ProjectSitePreview } from "@/components/projects/renderer/ProjectSitePreview";
import { Button } from "@/components/ui/button";
import { type GeneratedProjectFile } from "@/lib/projects/generated-source";
import { type ProjectSiteSchema } from "@/lib/projects/site-schema";

type WorkspaceShellProps = {
  projectId: string;
  initialPrompt?: string;
  initialStatus: string;
  initialMessages: UIMessage[];
  initialChatCursor: number | null;
  initialChatHasMore: boolean;
  siteSchema: ProjectSiteSchema;
};

type BuildProgress = {
  label: string;
  detail: string;
};

type BuildTab = "preview" | "timeline" | "changes" | "code";

export function WorkspaceShell({
  projectId,
  initialPrompt = "",
  initialStatus,
  initialMessages,
  initialChatCursor,
  initialChatHasMore,
  siteSchema: initialSiteSchema,
}: WorkspaceShellProps) {
  const [mode, setMode] = useState<"build" | "discuss">("discuss");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [message, setMessage] = useState("");
  const [siteSchema, setSiteSchema] = useState(initialSiteSchema);
  const [buildStatus, setBuildStatus] = useState(initialStatus);
  const [buildProgress, setBuildProgress] = useState<BuildProgress[]>([]);
  const [buildError, setBuildError] = useState("");
  const [chatWidth, setChatWidth] = useState(560);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [buildDetailsOpen, setBuildDetailsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<BuildTab>("preview");
  const [sourceFiles, setSourceFiles] = useState<GeneratedProjectFile[]>([]);
  const [sourceStatus, setSourceStatus] = useState("not_started");
  const [sourceLog, setSourceLog] = useState("");
  const [olderMessages, setOlderMessages] = useState<UIMessage[]>([]);
  const [chatCursor, setChatCursor] = useState<number | null>(
    initialChatCursor,
  );
  const [hasMoreChat, setHasMoreChat] = useState(initialChatHasMore);
  const [isLoadingOlderChat, setIsLoadingOlderChat] = useState(false);
  const prompt = initialPrompt.trim();
  const hasStartedChat = useRef(false);
  const hasStartedBuild = useRef(false);
  const modeRef = useRef(mode);
  const buildAbortRef = useRef<AbortController | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const previousLiveMessageCount = useRef(initialMessages.length);
  const { messages, sendMessage, status, error, stop } = useChat({
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

    setMode("build");
    setBuildError("");
    setBuildStatus("building");
    setBuildProgress([]);
    setActiveTab("timeline");

    const abortController = new AbortController();
    buildAbortRef.current = abortController;

    try {
      const response = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        const result = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setBuildStatus("draft");
        setBuildError(
          result?.message || "AI belum bisa membangun website ini.",
        );
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
            | { message?: string };

          if (eventName === "progress") {
            setBuildProgress((items) => [...items, data as BuildProgress]);
          }

          if (eventName === "schema" || eventName === "done") {
            setSiteSchema(data as ProjectSiteSchema);
            setActiveTab("preview");
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
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setBuildStatus("draft");
        setBuildError("AI belum bisa membangun website ini.");
      }
    } finally {
      buildAbortRef.current = null;
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

  const isResponding = status === "submitted" || status === "streaming";
  const isBuilding = buildStatus === "building";
  const isProcessing = isResponding || isBuilding;
  const visibleMessages = [...olderMessages, ...messages];
  const latestAssistantText = [...messages]
    .reverse()
    .find((item) => item.role === "assistant")
    ?.parts.filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ");
  const canStartBuild =
    /mulai\s+(build|buat)|siap\s+(di)?(build|buat)|brief\s+sudah\s+(cukup\s+)?jelas/i.test(
      latestAssistantText || "",
    );

  useEffect(() => {
    if (activeTab !== "code" && buildStatus !== "ready") {
      return;
    }

    let ignore = false;

    async function loadSource() {
      const response = await fetch(`/api/projects/${projectId}/source`);
      const result = (await response.json()) as {
        buildLog?: string;
        buildStatus?: string;
        files?: GeneratedProjectFile[];
      };

      if (!ignore && response.ok) {
        setSourceFiles(result.files ?? []);
        setSourceStatus(result.buildStatus ?? "not_started");
        setSourceLog(result.buildLog ?? "");
      }
    }

    void loadSource();

    return () => {
      ignore = true;
    };
  }, [activeTab, buildStatus, projectId]);

  async function loadOlderChat() {
    if (!hasMoreChat || isLoadingOlderChat || chatCursor === null) {
      return;
    }

    setIsLoadingOlderChat(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/chat?before=${chatCursor}`,
      );
      const result = (await response.json()) as {
        messages?: UIMessage[];
        nextCursor?: number | null;
        hasMore?: boolean;
      };

      if (response.ok) {
        setOlderMessages((current) => [...(result.messages || []), ...current]);
        setChatCursor(result.nextCursor ?? null);
        setHasMoreChat(Boolean(result.hasMore));
      }
    } finally {
      setIsLoadingOlderChat(false);
    }
  }

  function stopCurrentJob() {
    if (isResponding) {
      stop();
      return;
    }

    buildAbortRef.current?.abort();
    buildAbortRef.current = null;
    void fetch(`/api/projects/${projectId}/stop`, { method: "POST" });
    setBuildStatus("draft");
    setMode("discuss");
    setBuildError("Proses dihentikan.");
  }

  useEffect(() => {
    const element = chatScrollRef.current;

    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, []);

  useEffect(() => {
    const element = chatScrollRef.current;

    if (!element || messages.length <= previousLiveMessageCount.current) {
      previousLiveMessageCount.current = messages.length;
      return;
    }

    element.scrollTop = element.scrollHeight;
    previousLiveMessageCount.current = messages.length;
  }, [messages.length]);

  function handleMessageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();

    if (!text || isProcessing) {
      return;
    }

    setMessage("");
    sendMessage({ text }, { body: { mode } });
  }

  function handleDividerPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = chatWidth;

    function move(pointerEvent: globalThis.PointerEvent) {
      const next = startWidth + (pointerEvent.clientX - startX);
      setChatWidth(Math.min(720, Math.max(420, next)));
    }

    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="h-[calc(100dvh-4rem)] overflow-hidden bg-[#10100f] text-surface-warm-white">
      <div
        className="grid h-full min-h-0 gap-0 lg:grid-cols-[var(--chat-width)_8px_minmax(0,1fr)]"
        style={{
          ["--chat-width" as string]: chatCollapsed ? "0px" : `${chatWidth}px`,
        }}
      >
        <section className="min-h-0 min-w-0 p-spacing-5 lg:order-3 lg:p-spacing-7">
          <div className="flex h-full min-h-0 flex-col rounded-[32px] border border-surface-warm-white/10 bg-[#ebe8df] p-spacing-4 text-foreground-primary shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
            <WorkspaceTopBar
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              viewport={viewport}
              setViewport={setViewport}
              chatCollapsed={chatCollapsed}
              setChatCollapsed={setChatCollapsed}
            />
            <div className="mt-spacing-4 flex-1 overflow-auto rounded-[24px] bg-[#d8d3c8] p-spacing-5">
              {activeTab === "preview" ? (
                sourceStatus === "passed" ? (
                  <GeneratedPreviewFrame
                    projectId={projectId}
                    viewport={viewport}
                  />
                ) : buildStatus === "ready" ? (
                  <div className="flex justify-center">
                    <ProjectSitePreview
                      siteSchema={siteSchema}
                      viewport={viewport}
                    />
                  </div>
                ) : (
                  <EmptyPreviewState />
                )
              ) : null}

              {activeTab === "timeline" ? (
                <TimelineView
                  isBuilding={isBuilding}
                  buildProgress={buildProgress}
                  buildError={buildError}
                />
              ) : null}

              {activeTab === "changes" ? (
                <ChangesView
                  siteSchema={siteSchema}
                  buildProgress={buildProgress}
                />
              ) : null}

              {activeTab === "code" ? (
                <CodeView
                  projectId={projectId}
                  files={sourceFiles}
                  buildLog={sourceLog}
                  buildStatus={sourceStatus}
                />
              ) : null}
            </div>
          </div>
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={handleDividerPointerDown}
          className="hidden cursor-col-resize bg-transparent transition hover:bg-surface-warm-white/8 lg:order-2 lg:block"
        />

        <aside
          className={`${chatCollapsed ? "hidden" : "flex"} min-h-0 min-w-0 flex-col border-r border-surface-warm-white/10 bg-[#1b1b19] p-spacing-5 lg:order-1 lg:flex`}
        >
          <div className="flex items-start justify-between gap-spacing-5 px-spacing-1">
            <div>
              <p className="text-sm text-surface-warm-white/54">
                Website usahamu
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-[-0.04em]">
                {mode === "build" ? "Buat website" : "Diskusi brief"}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => setChatCollapsed(true)}
              className="hidden rounded-full border border-surface-warm-white/10 p-spacing-3 text-surface-warm-white/62 hover:text-surface-warm-white lg:block"
              aria-label="Tutup chat"
            >
              <PanelRightClose className="size-4" />
            </button>
          </div>

          <div
            ref={chatScrollRef}
            className="mt-spacing-5 min-h-0 flex-1 space-y-spacing-6 overflow-y-auto overflow-x-hidden px-spacing-1 pr-spacing-2 [scrollbar-color:#6f6a60_transparent] [scrollbar-width:thin]"
          >
            {hasMoreChat ? (
              <button
                type="button"
                onClick={() => void loadOlderChat()}
                disabled={isLoadingOlderChat}
                className="mx-auto block rounded-full border border-surface-warm-white/10 px-spacing-4 py-spacing-2 text-xs text-surface-warm-white/54 hover:text-surface-warm-white disabled:opacity-50"
              >
                {isLoadingOlderChat ? "Memuat..." : "Muat chat lama"}
              </button>
            ) : null}
            {!isBuilding ? <AiDiscussionNotice /> : null}

            <ChatMessages messages={visibleMessages} />

            {!isProcessing && canStartBuild ? (
              <BuildStartCard onBuild={() => void startBuild()} />
            ) : null}

            {isResponding ? (
              <p className="text-sm text-surface-warm-white/46">
                AI sedang menyiapkan jawaban...
              </p>
            ) : null}
            {error ? (
              <p className="text-sm text-[#ffb4a6]">
                AI belum bisa menjawab. Coba lagi nanti.
              </p>
            ) : null}
          </div>

          <div className="mt-spacing-5">
            <BuildStatusDisclosure
              open={buildDetailsOpen}
              setOpen={setBuildDetailsOpen}
              isBuilding={isBuilding}
              buildProgress={buildProgress}
              buildError={buildError}
            />
            {isProcessing ? (
              <ProcessingControl
                mode={isBuilding ? "Buat" : "Diskusi"}
                onStop={stopCurrentJob}
              />
            ) : (
              <form
                onSubmit={handleMessageSubmit}
                className="mt-spacing-3 rounded-[28px] border border-surface-warm-white/12 bg-[#262622] p-spacing-4 shadow-[0_18px_48px_rgba(0,0,0,0.22)]"
              >
                <label htmlFor="workspace-message" className="sr-only">
                  Pesan untuk AI
                </label>
                <textarea
                  id="workspace-message"
                  rows={3}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={
                    mode === "build"
                      ? "Minta perubahan, contoh: buat lebih premium..."
                      : "Jawab pilihan atau tulis kebutuhanmu..."
                  }
                  className="w-full resize-none bg-transparent px-spacing-3 py-spacing-3 text-sm leading-6 text-surface-warm-white outline-none [scrollbar-width:none] placeholder:text-surface-warm-white/38 disabled:opacity-60 [&::-webkit-scrollbar]:hidden"
                />
                <div className="flex items-center justify-between gap-spacing-4">
                  <ModePill mode="Diskusi" tone="idle" />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!message.trim()}
                    className="size-9 rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-50"
                    aria-label="Kirim pesan"
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                </div>
              </form>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function WorkspaceTopBar({
  activeTab,
  setActiveTab,
  viewport,
  setViewport,
  chatCollapsed,
  setChatCollapsed,
}: {
  activeTab: BuildTab;
  setActiveTab: (tab: BuildTab) => void;
  viewport: "desktop" | "mobile";
  setViewport: (viewport: "desktop" | "mobile") => void;
  chatCollapsed: boolean;
  setChatCollapsed: (collapsed: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-spacing-4 rounded-[22px] bg-surface-warm-white px-spacing-5 py-spacing-4">
      <div className="flex rounded-full bg-surface-muted p-1 text-sm">
        <TabButton
          active={activeTab === "preview"}
          onClick={() => setActiveTab("preview")}
          icon={<Globe2 className="size-4" />}
        >
          Preview
        </TabButton>
        <TabButton
          active={activeTab === "timeline"}
          onClick={() => setActiveTab("timeline")}
          icon={<Clock3 className="size-4" />}
        >
          Timeline
        </TabButton>
        <TabButton
          active={activeTab === "changes"}
          onClick={() => setActiveTab("changes")}
          icon={<FileCode2 className="size-4" />}
        >
          Changes
        </TabButton>
        <TabButton
          active={activeTab === "code"}
          onClick={() => setActiveTab("code")}
          icon={<Code2 className="size-4" />}
        >
          Code
        </TabButton>
      </div>

      <div className="flex items-center gap-spacing-3">
        <div className="flex rounded-full bg-surface-muted p-1 text-sm">
          <button
            type="button"
            onClick={() => setViewport("desktop")}
            className={`flex items-center gap-spacing-3 rounded-full px-spacing-5 py-spacing-3 transition ${viewport === "desktop" ? "bg-foreground-primary text-surface-warm-white" : "text-text-secondary hover:text-foreground-primary"}`}
          >
            <Monitor className="size-4" aria-hidden="true" />
            Komputer
          </button>
          <button
            type="button"
            onClick={() => setViewport("mobile")}
            className={`flex items-center gap-spacing-3 rounded-full px-spacing-5 py-spacing-3 transition ${viewport === "mobile" ? "bg-foreground-primary text-surface-warm-white" : "text-text-secondary hover:text-foreground-primary"}`}
          >
            <Smartphone className="size-4" aria-hidden="true" />
            HP
          </button>
        </div>
        {chatCollapsed ? (
          <button
            type="button"
            onClick={() => setChatCollapsed(false)}
            className="rounded-full bg-foreground-primary p-spacing-3 text-surface-warm-white"
            aria-label="Buka chat"
          >
            <PanelRightOpen className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-spacing-3 rounded-full px-spacing-5 py-spacing-3 transition ${active ? "bg-foreground-primary text-surface-warm-white" : "text-text-secondary hover:text-foreground-primary"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function GeneratedPreviewFrame({
  projectId,
  viewport,
}: {
  projectId: string;
  viewport: "desktop" | "mobile";
}) {
  return (
    <div className="flex justify-center">
      <iframe
        title="Generated website preview"
        src={`/api/projects/${projectId}/preview/`}
        sandbox="allow-scripts"
        className={`${viewport === "mobile" ? "h-[760px] max-w-[390px]" : "h-[760px] max-w-6xl"} w-full rounded-[28px] border-0 bg-white shadow-[0_18px_48px_rgba(28,28,28,0.16)]`}
      />
    </div>
  );
}

function EmptyPreviewState() {
  return (
    <div className="grid min-h-[620px] place-items-center rounded-[28px] bg-surface-warm-white p-spacing-10 text-center shadow-[0_18px_48px_rgba(28,28,28,0.12)]">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-text-secondary">
          Belum ada preview
        </p>
        <h2 className="mt-spacing-6 text-6xl font-semibold leading-none tracking-[-0.07em] text-foreground-primary">
          AI masih merapikan brief.
        </h2>
        <p className="mx-auto mt-spacing-7 max-w-xl text-lg leading-8 text-text-secondary">
          Preview akan muncul setelah AI yakin kebutuhan usaha sudah cukup jelas
          dan proses build selesai.
        </p>
        <div className="mx-auto mt-spacing-9 grid max-w-2xl gap-spacing-3 text-left text-sm text-text-secondary sm:grid-cols-3">
          <div className="rounded-[20px] bg-surface-muted p-spacing-5">
            1. Jawab pertanyaan AI.
          </div>
          <div className="rounded-[20px] bg-surface-muted p-spacing-5">
            2. AI susun brief.
          </div>
          <div className="rounded-[20px] bg-surface-muted p-spacing-5">
            3. Build dimulai saat siap.
          </div>
        </div>
      </div>
    </div>
  );
}

function AiDiscussionNotice() {
  return (
    <div className="rounded-[22px] border border-surface-warm-white/10 bg-surface-warm-white/6 p-spacing-5">
      <p className="text-sm font-semibold text-surface-warm-white">
        AI yang menentukan pertanyaan berikutnya.
      </p>
      <p className="mt-spacing-2 text-sm leading-6 text-surface-warm-white/58">
        Jawab lewat chat. Kalau brief belum jelas, AI akan tanya lagi. Kalau
        sudah siap, AI akan mulai proses build dari brief yang sudah terkunci.
      </p>
    </div>
  );
}

function ModePill({
  mode,
  tone,
}: {
  mode: "Diskusi" | "Buat";
  tone: "idle" | "busy";
}) {
  return (
    <span className="inline-flex items-center gap-spacing-2 rounded-full border border-surface-warm-white/10 bg-surface-warm-white/6 px-spacing-3 py-spacing-2 text-xs text-surface-warm-white/60">
      <span
        className={`size-2 rounded-full ${tone === "busy" ? "animate-pulse bg-[#ff9b5f]" : "bg-[#8ce99a]"}`}
      />
      Mode: {mode}
    </span>
  );
}

function ProcessingControl({
  mode,
  onStop,
}: {
  mode: "Diskusi" | "Buat";
  onStop: () => void;
}) {
  return (
    <div className="mt-spacing-4 rounded-[26px] border border-[#ff9b5f]/30 bg-[#ff9b5f]/10 p-spacing-5">
      <div className="flex items-center justify-between gap-spacing-4">
        <div>
          <ModePill mode={mode} tone="busy" />
          <p className="mt-spacing-3 text-sm text-surface-warm-white/72">
            AI sedang bekerja. Input ditutup sementara supaya alur tidak
            bentrok.
          </p>
        </div>
        <Button
          type="button"
          onClick={onStop}
          className="shrink-0 rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86"
        >
          Stop proses
        </Button>
      </div>
    </div>
  );
}

function BuildStartCard({ onBuild }: { onBuild: () => void }) {
  return (
    <div className="rounded-[22px] border border-[#8ce99a]/30 bg-[#8ce99a]/10 p-spacing-5">
      <div className="flex items-center justify-between gap-spacing-4">
        <div>
          <p className="text-sm font-semibold text-surface-warm-white">
            Brief sudah cukup jelas.
          </p>
          <p className="mt-spacing-2 text-sm text-surface-warm-white/62">
            Mulai build dari jawaban yang sudah terkumpul.
          </p>
        </div>
        <Button
          type="button"
          onClick={onBuild}
          className="shrink-0 rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86"
        >
          Mulai build
        </Button>
      </div>
    </div>
  );
}

function ChatMessages({ messages }: { messages: UIMessage[] }) {
  if (!messages.length) {
    return (
      <div className="rounded-[22px] border border-surface-warm-white/10 bg-surface-warm-white/6 px-spacing-6 py-spacing-5 text-sm leading-6 text-surface-warm-white/70">
        AI siap bantu merapikan brief. Tulis jawabanmu, lalu AI akan menentukan
        pertanyaan berikutnya.
      </div>
    );
  }

  return (
    <div className="space-y-spacing-7">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex max-w-full text-sm leading-6 ${message.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[86%] overflow-hidden break-words rounded-[18px] px-spacing-5 py-spacing-3 ${message.role === "user" ? "border border-surface-warm-white/12 bg-[#30302c] text-surface-warm-white/86" : "border border-surface-warm-white/10 bg-[#242421] text-surface-warm-white/78"}`}
          >
            {message.parts.map((part, index) =>
              part.type === "text" ? (
                <MessageText key={index} text={part.text} />
              ) : null,
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function MessageText({ text }: { text: string }) {
  const lines = text.split("\n").filter((line) => line.trim());

  return (
    <div className="space-y-spacing-3">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        const listMatch = trimmed.match(/^(\d+\.|[-*])\s+(.*)$/);

        if (listMatch) {
          return (
            <p
              key={index}
              className="break-words pl-spacing-4 text-surface-warm-white/72"
            >
              <span className="text-[#ffb38d]">{listMatch[1]}</span>{" "}
              {formatInlineMarkdown(listMatch[2])}
            </p>
          );
        }

        if (trimmed.startsWith("###")) {
          return (
            <p
              key={index}
              className="break-words font-semibold text-surface-warm-white"
            >
              {formatInlineMarkdown(trimmed.replace(/^#+\s*/, ""))}
            </p>
          );
        }

        return (
          <p key={index} className="break-words">
            {formatInlineMarkdown(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function formatInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold text-surface-warm-white">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

function BuildStatusDisclosure({
  open,
  setOpen,
  isBuilding,
  buildProgress,
  buildError,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  isBuilding: boolean;
  buildProgress: BuildProgress[];
  buildError: string;
}) {
  return (
    <div className="rounded-[20px] border border-surface-warm-white/10 bg-surface-warm-white/6">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-spacing-4 px-spacing-5 py-spacing-4 text-left text-sm"
      >
        <span className="flex items-center gap-spacing-3 font-medium">
          {isBuilding ? (
            <Loader2 className="size-4 animate-spin text-[#ff5e27]" />
          ) : (
            <Code2 className="size-4 text-surface-warm-white/62" />
          )}
          {isBuilding ? "AI sedang membangun" : "Detail proses"}
        </span>
        {open ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
      </button>
      {open ? (
        <div className="border-t border-surface-warm-white/10 px-spacing-5 py-spacing-4">
          {buildProgress.length ? (
            <ul className="space-y-spacing-4 text-sm text-surface-warm-white/64">
              {buildProgress.slice(-4).map((item, index) => (
                <li
                  key={`${item.label}-${index}`}
                  className="flex gap-spacing-3"
                >
                  <CheckCircle2 className="mt-0.5 size-4 text-[#ff5e27]" />
                  <span>
                    <span className="block text-surface-warm-white">
                      {item.label}
                    </span>
                    <span>{item.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-surface-warm-white/54">
              Belum ada proses build aktif.
            </p>
          )}
          {buildError ? (
            <p className="mt-spacing-4 text-sm text-[#ffb4a6]">{buildError}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TimelineView({
  isBuilding,
  buildProgress,
  buildError,
}: {
  isBuilding: boolean;
  buildProgress: BuildProgress[];
  buildError: string;
}) {
  return (
    <div className="mx-auto max-w-3xl rounded-[28px] bg-surface-warm-white p-spacing-8 shadow-[0_18px_48px_rgba(28,28,28,0.12)]">
      <h2 className="text-4xl font-semibold tracking-[-0.06em]">
        Timeline build
      </h2>
      <div className="mt-spacing-8 space-y-spacing-6">
        {buildProgress.length ? (
          buildProgress.map((item, index) => (
            <div key={`${item.label}-${index}`} className="flex gap-spacing-5">
              <span className="mt-1 flex size-8 items-center justify-center rounded-full bg-foreground-primary text-xs text-surface-warm-white">
                {index + 1}
              </span>
              <div>
                <p className="font-semibold">{item.label}</p>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  {item.detail}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-text-secondary">Belum ada timeline build.</p>
        )}
        {isBuilding ? (
          <p className="flex items-center gap-spacing-3 text-sm text-text-secondary">
            <Loader2 className="size-4 animate-spin" /> Build masih berjalan.
          </p>
        ) : null}
        {buildError ? (
          <p className="text-sm text-red-600">{buildError}</p>
        ) : null}
      </div>
    </div>
  );
}

function CodeView({
  projectId,
  files,
  buildLog,
  buildStatus,
}: {
  projectId: string;
  files: GeneratedProjectFile[];
  buildLog: string;
  buildStatus: string;
}) {
  const [selectedPath, setSelectedPath] = useState(files[0]?.path || "");
  const selectedFile =
    files.find((file) => file.path === selectedPath) ?? files[0];

  return (
    <div className="grid min-h-[680px] overflow-hidden rounded-[28px] bg-[#10100f] text-surface-warm-white shadow-[0_18px_48px_rgba(28,28,28,0.18)] md:grid-cols-[280px_1fr]">
      <aside className="border-r border-surface-warm-white/10 p-spacing-5">
        <div className="flex items-center justify-between gap-spacing-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-surface-warm-white/42">
              Source
            </p>
            <h2 className="mt-1 text-lg font-semibold">Generated project</h2>
            <p className="mt-1 text-xs text-surface-warm-white/42">
              Build: {buildStatus}
            </p>
          </div>
        </div>
        <a
          href={`/api/projects/${projectId}/source`}
          target="_blank"
          rel="noreferrer"
          className="mt-spacing-5 inline-flex rounded-full border border-surface-warm-white/12 px-spacing-5 py-spacing-3 text-xs text-surface-warm-white/76 hover:bg-surface-warm-white/8"
        >
          Export JSON
        </a>
        {buildLog ? (
          <details className="mt-spacing-5 rounded-radius-lg border border-surface-warm-white/10 p-spacing-4 text-xs text-surface-warm-white/58">
            <summary className="cursor-pointer text-surface-warm-white/78">
              Build log
            </summary>
            <pre className="mt-spacing-3 max-h-44 overflow-auto whitespace-pre-wrap">
              {buildLog}
            </pre>
          </details>
        ) : null}
        <div className="mt-spacing-6 grid gap-spacing-2">
          {files.map((file) => (
            <button
              key={file.path}
              type="button"
              onClick={() => setSelectedPath(file.path)}
              className={`rounded-radius-lg px-spacing-4 py-spacing-3 text-left text-sm transition ${selectedFile?.path === file.path ? "bg-surface-warm-white text-foreground-primary" : "text-surface-warm-white/62 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"}`}
            >
              {file.path}
            </button>
          ))}
        </div>
      </aside>
      <section className="min-w-0 p-spacing-5">
        <p className="mb-spacing-4 text-sm text-surface-warm-white/54">
          {selectedFile?.path}
        </p>
        <pre className="max-h-[620px] overflow-auto rounded-[18px] bg-black/40 p-spacing-5 text-xs leading-6 text-surface-warm-white/82">
          <code>{selectedFile?.content}</code>
        </pre>
      </section>
    </div>
  );
}

function ChangesView({
  siteSchema,
  buildProgress,
}: {
  siteSchema: ProjectSiteSchema;
  buildProgress: BuildProgress[];
}) {
  return (
    <div className="mx-auto max-w-3xl rounded-[28px] bg-surface-warm-white p-spacing-8 shadow-[0_18px_48px_rgba(28,28,28,0.12)]">
      <h2 className="text-4xl font-semibold tracking-[-0.06em]">Changes</h2>
      <ul className="mt-spacing-8 space-y-spacing-4 text-sm leading-6 text-text-secondary">
        <li>
          <span className="font-semibold text-foreground-primary">+</span> Hero:{" "}
          {siteSchema.headline}
        </li>
        <li>
          <span className="font-semibold text-foreground-primary">+</span> Trust
          points: {siteSchema.trustPoints.join(", ")}
        </li>
        <li>
          <span className="font-semibold text-foreground-primary">+</span>{" "}
          Sections:{" "}
          {siteSchema.sections.map((section) => section.title).join(", ")}
        </li>
        <li>
          <span className="font-semibold text-foreground-primary">~</span> Build
          steps recorded: {buildProgress.length}
        </li>
      </ul>
    </div>
  );
}

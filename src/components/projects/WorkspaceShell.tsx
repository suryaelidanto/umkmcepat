"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  ArrowLeft,
  ArrowUp,
  Check,
  Code2,
  Globe2,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Smartphone,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { type PanelImperativeHandle } from "react-resizable-panels";

import { ProjectSitePreview } from "@/components/projects/renderer/ProjectSitePreview";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { type WorkspaceCard } from "@/lib/projects/brief";
import { type GeneratedProjectFile } from "@/lib/projects/generated-source";
import { type ProjectSiteSchema } from "@/lib/projects/site-schema";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
});

type WorkspaceShellProps = {
  projectId: string;
  initialTitle: string;
  initialPrompt?: string;
  initialStatus: string;
  initialMessages: UIMessage[];
  initialChatCursor: number | null;
  initialChatHasMore: boolean;
  initialWorkspaceCard: WorkspaceCard;
  siteSchema: ProjectSiteSchema;
};

type BuildTab = "preview" | "code";

export function WorkspaceShell({
  projectId,
  initialTitle,
  initialPrompt = "",
  initialStatus,
  initialMessages,
  initialChatCursor,
  initialChatHasMore,
  initialWorkspaceCard,
  siteSchema: initialSiteSchema,
}: WorkspaceShellProps) {
  const [mode, setMode] = useState<"build" | "discuss">("discuss");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [message, setMessage] = useState("");
  const [projectTitle, setProjectTitle] = useState(initialTitle);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(initialTitle);
  const [siteSchema, setSiteSchema] = useState(initialSiteSchema);
  const [buildStatus, setBuildStatus] = useState(initialStatus);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(true);
  const [activeTab, setActiveTab] = useState<BuildTab>("preview");
  const [sourceFiles, setSourceFiles] = useState<GeneratedProjectFile[]>([]);
  const [sourceStatus, setSourceStatus] = useState("not_started");
  const [sourceLog, setSourceLog] = useState("");
  const [workspaceCard, setWorkspaceCard] =
    useState<WorkspaceCard>(initialWorkspaceCard);
  const [isRefreshingCard, setIsRefreshingCard] = useState(false);
  const [cardError, setCardError] = useState(false);
  const [questionMode, setQuestionMode] = useState(true);
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
  const chatPanelRef = useRef<PanelImperativeHandle | null>(null);
  const previewPanelRef = useRef<PanelImperativeHandle | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const olderChatSentinelRef = useRef<HTMLDivElement | null>(null);
  const hasAutoOpenedPreview = useRef(false);
  const previousLiveMessageCount = useRef(initialMessages.length);
  const previousScrollHeight = useRef<number | null>(null);
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
    setBuildStatus("building");
    setActiveTab("preview");

    const abortController = new AbortController();
    buildAbortRef.current = abortController;

    try {
      const response = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        setBuildStatus("draft");
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
            | { message?: string };

          if (eventName === "schema" || eventName === "done") {
            setSiteSchema(data as ProjectSiteSchema);
            setActiveTab("preview");
          }

          if (eventName === "done") {
            setBuildStatus("ready");
          }

          if (eventName === "error") {
            setBuildStatus("draft");
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setBuildStatus("draft");
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
    if (hasStartedChat.current || !prompt || initialMessages.length) {
      return;
    }

    hasStartedChat.current = true;
    sendMessage({ text: prompt }, { body: { mode } });
  }, [initialMessages.length, mode, prompt, sendMessage]);

  const isResponding = status === "submitted" || status === "streaming";
  const isBuilding = buildStatus === "building";
  const isProcessing = isResponding || isBuilding;
  const visibleMessages = [...olderMessages, ...messages];
  const hasActiveQuestionCard =
    workspaceCard.type === "questions" && questionMode;
  const hasPreview = sourceStatus === "passed" || buildStatus === "ready";
  const showPreviewPanel = !previewCollapsed;
  const showChatPanel = !chatCollapsed;
  useEffect(() => {
    if (hasPreview && !hasAutoOpenedPreview.current) {
      hasAutoOpenedPreview.current = true;
      setPreviewCollapsed(false);
    }
  }, [hasPreview]);

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

  const loadOlderChat = useCallback(async () => {
    if (!hasMoreChat || isLoadingOlderChat || chatCursor === null) {
      return;
    }

    setIsLoadingOlderChat(true);
    previousScrollHeight.current = chatScrollRef.current?.scrollHeight ?? null;
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
  }, [chatCursor, hasMoreChat, isLoadingOlderChat, projectId]);

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
  }

  useEffect(() => {
    const sentinel = olderChatSentinelRef.current;
    const root = chatScrollRef.current;

    if (!sentinel || !root || !hasMoreChat) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadOlderChat();
        }
      },
      { root, rootMargin: "160px 0px 0px 0px" },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [chatCursor, hasMoreChat, isLoadingOlderChat, loadOlderChat]);

  useEffect(() => {
    const element = chatScrollRef.current;

    if (element && previousScrollHeight.current !== null) {
      element.scrollTop += element.scrollHeight - previousScrollHeight.current;
      previousScrollHeight.current = null;
    }
  }, [olderMessages.length]);

  useEffect(() => {
    const scrollToLatest = () => {
      const element = chatScrollRef.current;

      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    };

    const frame = requestAnimationFrame(scrollToLatest);
    const timeout = window.setTimeout(scrollToLatest, 120);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
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

  const refreshWorkspaceCard = useCallback(async () => {
    setIsRefreshingCard(true);
    setCardError(false);

    try {
      const response = await fetch(`/api/projects/${projectId}/brief-card`);
      const result = (await response.json().catch(() => null)) as {
        workspaceCard?: WorkspaceCard;
      } | null;

      if (!response.ok || !result?.workspaceCard) {
        setCardError(true);
        return;
      }

      setWorkspaceCard(result.workspaceCard);
    } catch {
      setCardError(true);
    } finally {
      setIsRefreshingCard(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isProcessing) {
      return;
    }

    void refreshWorkspaceCard();
  }, [isProcessing, messages.length, refreshWorkspaceCard]);

  useEffect(() => {
    if (workspaceCard.type === "questions") {
      setQuestionMode(true);
    }
  }, [workspaceCard]);

  async function saveProjectTitle() {
    const title = draftTitle.trim();

    if (!title || title === projectTitle) {
      setIsRenaming(false);
      setDraftTitle(projectTitle);
      return;
    }

    const response = await fetch(`/api/projects/${projectId}/title`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const result = (await response.json().catch(() => null)) as {
      title?: string;
    } | null;

    if (response.ok && result?.title) {
      setProjectTitle(result.title);
      setDraftTitle(result.title);
    }

    setIsRenaming(false);
  }

  const submitChatText = useCallback(
    (text: string) => {
      const trimmed = text.trim();

      if (!trimmed || isProcessing) {
        return;
      }

      setMessage("");
      setQuestionMode(true);
      sendMessage({ text: trimmed }, { body: { mode } });
    },
    [isProcessing, mode, sendMessage],
  );

  function handleMessageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitChatText(message);
  }

  function closePreviewPanel() {
    if (!showChatPanel) {
      return;
    }

    setPreviewCollapsed(true);
    chatPanelRef.current?.resize("100%");
    previewPanelRef.current?.collapse();
  }

  function closeChatPanel() {
    if (!showPreviewPanel) {
      return;
    }

    setChatCollapsed(true);
    chatPanelRef.current?.collapse();
    previewPanelRef.current?.resize("100%");
  }

  function openPreviewPanel() {
    setChatCollapsed(false);
    setPreviewCollapsed(false);
    chatPanelRef.current?.resize("32%");
    previewPanelRef.current?.resize("68%");
  }

  function openChatPanel() {
    setChatCollapsed(false);
    setPreviewCollapsed(false);
    chatPanelRef.current?.resize("32%");
    previewPanelRef.current?.resize("68%");
  }

  const chatPanelClass =
    "flex h-full min-h-0 min-w-0 overflow-x-hidden flex-col bg-[#1b1b19] p-spacing-5";
  const previewPanelClass = "h-full min-h-0 min-w-0";

  return (
    <div className="h-dvh overflow-hidden bg-[#10100f] text-surface-warm-white">
      <ResizablePanelGroup
        orientation="horizontal"
        className="h-full min-h-0 overflow-hidden"
      >
        <ResizablePanel
          id="chat"
          panelRef={chatPanelRef}
          defaultSize="100%"
          minSize="8%"
          collapsible
          collapsedSize="0%"
        >
          <aside className={chatPanelClass}>
            <div className="flex min-w-0 items-start justify-between gap-spacing-5 px-spacing-1">
              <div className="min-w-0 flex-1">
                <Link
                  href="/"
                  className="inline-flex items-center gap-spacing-2 text-xs text-surface-warm-white/46 hover:text-surface-warm-white"
                >
                  <ArrowLeft className="size-3.5" />
                  Dashboard
                </Link>
                <div className="mt-spacing-3 flex items-center gap-spacing-2">
                  {isRenaming ? (
                    <input
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onBlur={() => void saveProjectTitle()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          void saveProjectTitle();
                        }

                        if (event.key === "Escape") {
                          setDraftTitle(projectTitle);
                          setIsRenaming(false);
                        }
                      }}
                      autoFocus
                      className="min-w-0 flex-1 rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/8 px-spacing-3 py-spacing-2 text-base font-semibold text-surface-warm-white outline-none focus:border-surface-warm-white/30"
                    />
                  ) : (
                    <h1 className="truncate text-base font-semibold tracking-[-0.02em]">
                      {projectTitle}
                    </h1>
                  )}
                  {isRenaming ? (
                    <button
                      type="button"
                      onClick={() => void saveProjectTitle()}
                      className="rounded-full p-spacing-2 text-[#8ce99a] hover:bg-surface-warm-white/8"
                      aria-label="Simpan nama proyek"
                    >
                      <Check className="size-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsRenaming(true)}
                      className="rounded-full p-spacing-2 text-surface-warm-white/44 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
                      aria-label="Ubah nama proyek"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-spacing-2">
                <button
                  type="button"
                  onClick={
                    showPreviewPanel ? closePreviewPanel : openPreviewPanel
                  }
                  className="hidden rounded-full border border-surface-warm-white/10 p-spacing-3 text-surface-warm-white/62 hover:bg-surface-warm-white/8 hover:text-surface-warm-white lg:block"
                  aria-label={
                    showPreviewPanel ? "Tutup preview" : "Buka preview"
                  }
                >
                  {showPreviewPanel ? (
                    <PanelRightClose className="size-4" />
                  ) : (
                    <PanelRightOpen className="size-4" />
                  )}
                </button>
              </div>
            </div>

            <div
              ref={chatScrollRef}
              className="mt-spacing-5 min-h-0 flex-1 space-y-spacing-6 overflow-y-auto overflow-x-hidden px-spacing-1 pr-spacing-2 [scrollbar-color:#6f6a60_transparent] [scrollbar-width:thin]"
            >
              {hasMoreChat ? (
                <div
                  ref={olderChatSentinelRef}
                  className="py-spacing-3 text-center"
                >
                  {isLoadingOlderChat ? (
                    <span className="text-xs text-surface-warm-white/42">
                      Memuat chat lama...
                    </span>
                  ) : null}
                </div>
              ) : null}
              <ChatMessages messages={visibleMessages} />

              {!isProcessing &&
              workspaceCard.type === "build_recommendation" ? (
                <WorkspaceCardView
                  card={workspaceCard}
                  onBuild={() => void startBuild()}
                  onRefresh={() => void refreshWorkspaceCard()}
                  isRefreshing={isRefreshingCard}
                  hasError={cardError}
                  onAnswer={submitChatText}
                />
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
              {isProcessing ? (
                <ProcessingControl
                  mode={isBuilding ? "Buat" : "Diskusi"}
                  onStop={stopCurrentJob}
                />
              ) : hasActiveQuestionCard &&
                workspaceCard.type === "questions" ? (
                <QuestionStepperComposer
                  card={workspaceCard}
                  hasError={cardError}
                  isRefreshing={isRefreshingCard}
                  onCancel={() => setQuestionMode(false)}
                  onRefresh={() => void refreshWorkspaceCard()}
                  onSubmit={submitChatText}
                />
              ) : (
                <form
                  onSubmit={handleMessageSubmit}
                  className="mt-spacing-3 min-w-0 rounded-[28px] border border-surface-warm-white/12 bg-[#262622] p-spacing-4 shadow-[0_18px_48px_rgba(0,0,0,0.22)]"
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
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className="bg-surface-warm-white/8 transition-colors hover:bg-surface-warm-white/16"
        />

        <ResizablePanel
          id="preview"
          panelRef={previewPanelRef}
          defaultSize="0%"
          minSize="8%"
          collapsible
          collapsedSize="0%"
        >
          <section className={previewPanelClass}>
            <div className="flex h-full min-h-0 flex-col bg-[#10100f] text-surface-warm-white">
              <WorkspaceTopBar
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                viewport={viewport}
                setViewport={setViewport}
                chatCollapsed={chatCollapsed}
                openChatPanel={openChatPanel}
                closeChatPanel={closeChatPanel}
              />
              <div className="min-h-0 flex-1 overflow-auto bg-[#10100f]">
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
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function WorkspaceTopBar({
  activeTab,
  setActiveTab,
  viewport,
  setViewport,
  chatCollapsed,
  openChatPanel,
  closeChatPanel,
}: {
  activeTab: BuildTab;
  setActiveTab: (tab: BuildTab) => void;
  viewport: "desktop" | "mobile";
  setViewport: (viewport: "desktop" | "mobile") => void;
  chatCollapsed: boolean;
  openChatPanel: () => void;
  closeChatPanel: () => void;
}) {
  return (
    <div className="flex h-14 items-center justify-between gap-spacing-4 border-b border-surface-warm-white/10 bg-[#171715] px-spacing-4">
      <div className="flex items-center gap-spacing-3">
        <button
          type="button"
          onClick={chatCollapsed ? openChatPanel : closeChatPanel}
          className="rounded-radius-md border border-surface-warm-white/10 p-spacing-2 text-surface-warm-white/70 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
          aria-label={chatCollapsed ? "Buka chat" : "Tutup chat"}
        >
          {chatCollapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
        <div className="flex rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-1 text-xs">
          <TabButton
            active={activeTab === "preview"}
            onClick={() => setActiveTab("preview")}
            icon={<Globe2 className="size-4" />}
          >
            Preview
          </TabButton>
          <TabButton
            active={activeTab === "code"}
            onClick={() => setActiveTab("code")}
            icon={<Code2 className="size-4" />}
          >
            Code
          </TabButton>
        </div>
      </div>

      <div className="flex items-center gap-spacing-3">
        {activeTab === "preview" ? (
          <div className="flex rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewport("desktop")}
              className={`flex items-center gap-spacing-2 rounded-radius-md px-spacing-3 py-spacing-2 transition ${viewport === "desktop" ? "bg-surface-warm-white text-foreground-primary" : "text-surface-warm-white/58 hover:text-surface-warm-white"}`}
            >
              <Monitor className="size-4" aria-hidden="true" />
              Komputer
            </button>
            <button
              type="button"
              onClick={() => setViewport("mobile")}
              className={`flex items-center gap-spacing-2 rounded-radius-md px-spacing-3 py-spacing-2 transition ${viewport === "mobile" ? "bg-surface-warm-white text-foreground-primary" : "text-surface-warm-white/58 hover:text-surface-warm-white"}`}
            >
              <Smartphone className="size-4" aria-hidden="true" />
              HP
            </button>
          </div>
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
      className={`flex items-center gap-spacing-2 rounded-radius-md px-spacing-3 py-spacing-2 transition ${active ? "bg-surface-warm-white text-foreground-primary" : "text-surface-warm-white/58 hover:text-surface-warm-white"}`}
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
        className={`${viewport === "mobile" ? "h-[760px] max-w-[390px]" : "h-[760px] max-w-6xl"} w-full border-0 bg-white`}
      />
    </div>
  );
}

function EmptyPreviewState() {
  return (
    <div className="grid min-h-full place-items-center bg-[#10100f] p-spacing-10 text-center">
      <div>
        <h2 className="text-3xl font-semibold tracking-[-0.05em] text-surface-warm-white">
          Belum ada preview
        </h2>
        <p className="mx-auto mt-spacing-4 max-w-md text-sm leading-6 text-surface-warm-white/50">
          Preview akan muncul setelah brief cukup jelas dan proses build
          selesai.
        </p>
      </div>
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

function QuestionStepperComposer({
  card,
  hasError,
  isRefreshing,
  onCancel,
  onRefresh,
  onSubmit,
}: {
  card: Extract<WorkspaceCard, { type: "questions" }>;
  hasError: boolean;
  isRefreshing: boolean;
  onCancel: () => void;
  onRefresh: () => void;
  onSubmit: (answer: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const question = card.questions[Math.min(step, card.questions.length - 1)];
  const selectedAnswer = question ? answers[question.id] : "";
  const isLastStep = step >= card.questions.length - 1;
  const canContinue = Boolean(selectedAnswer);

  useEffect(() => {
    setStep(0);
    setAnswers({});
  }, [card]);

  if (!question) {
    return null;
  }

  function continueStep() {
    if (!canContinue) {
      return;
    }

    if (!isLastStep) {
      setStep((value) => value + 1);
      return;
    }

    const text = card.questions
      .map(
        (item, index) =>
          `${index + 1}. ${item.question}\nJawaban: ${answers[item.id]}`,
      )
      .join("\n\n");
    onSubmit(text);
  }

  return (
    <div className="mt-spacing-3 rounded-[28px] border border-surface-warm-white/12 bg-[#262622] p-spacing-4 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
      <div className="flex items-start justify-between gap-spacing-4 px-spacing-1">
        <div>
          <p className="text-xs font-medium text-surface-warm-white/46">
            Pertanyaan {step + 1} dari {card.questions.length}
          </p>
          <h2 className="mt-spacing-1 text-sm font-semibold text-surface-warm-white">
            {question.question}
          </h2>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-surface-warm-white/10 px-spacing-3 py-spacing-1.5 text-xs text-surface-warm-white/62 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
        >
          Tulis sendiri
        </button>
      </div>

      {question.options.length ? (
        <div className="mt-spacing-4 grid gap-spacing-2 sm:grid-cols-2">
          {question.options.map((option) => {
            const isSelected = selectedAnswer === option.label;

            return (
              <button
                key={option.label}
                type="button"
                onClick={() =>
                  setAnswers((value) => ({
                    ...value,
                    [question.id]: option.label,
                  }))
                }
                className={`rounded-radius-lg border px-spacing-4 py-spacing-3 text-left transition ${
                  isSelected
                    ? "border-surface-warm-white/44 bg-surface-warm-white/12"
                    : "border-surface-warm-white/10 bg-[#242421] hover:border-surface-warm-white/24 hover:bg-surface-warm-white/8"
                }`}
              >
                <span className="block text-sm font-semibold text-surface-warm-white">
                  {option.label}
                </span>
                <span className="mt-spacing-1 block text-xs leading-5 text-surface-warm-white/54">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-spacing-4 flex flex-wrap items-center gap-spacing-3 text-xs leading-5 text-surface-warm-white/54">
          <span>
            {hasError ? "Opsi belum siap." : "Menyiapkan opsi pilihan..."}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRefreshing}
            onClick={onRefresh}
            className="h-8 rounded-full border-surface-warm-white/12 bg-transparent text-xs text-surface-warm-white/78 hover:bg-surface-warm-white/8"
          >
            {isRefreshing ? "Menyiapkan..." : "Generate opsi"}
          </Button>
        </div>
      )}

      <div className="mt-spacing-4 flex items-center justify-between gap-spacing-3 px-spacing-1">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          className="rounded-full px-spacing-3 py-spacing-2 text-xs text-surface-warm-white/54 hover:bg-surface-warm-white/8 disabled:opacity-30"
        >
          Kembali
        </button>
        <Button
          type="button"
          disabled={!canContinue}
          onClick={continueStep}
          className="rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-50"
        >
          {isLastStep ? "Kirim jawaban" : "Lanjut"}
        </Button>
      </div>
    </div>
  );
}

function WorkspaceCardView({
  card,
  hasError,
  isRefreshing,
  onAnswer,
  onBuild,
  onRefresh,
}: {
  card: WorkspaceCard;
  hasError: boolean;
  isRefreshing: boolean;
  onAnswer: (answer: string) => void;
  onBuild: () => void;
  onRefresh: () => void;
}) {
  if (card.type === "build_recommendation") {
    return (
      <div className="rounded-[22px] border border-[#8ce99a]/30 bg-[#8ce99a]/10 p-spacing-5">
        <div className="flex items-center justify-between gap-spacing-4">
          <div>
            <p className="text-sm font-semibold text-surface-warm-white">
              {card.title}
            </p>
            <p className="mt-spacing-2 text-sm text-surface-warm-white/62">
              {card.summary.join(" · ")}
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

  return (
    <div className="space-y-spacing-4 rounded-[22px] border border-surface-warm-white/10 bg-surface-warm-white/6 p-spacing-5">
      {card.questions.map((question) => (
        <div key={question.id}>
          <p className="text-sm font-semibold text-surface-warm-white">
            {question.question}
          </p>
          {question.options.length ? (
            <div className="mt-spacing-3 grid gap-spacing-2 sm:grid-cols-2">
              {question.options.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => onAnswer(option.label)}
                  className="rounded-radius-lg border border-surface-warm-white/10 bg-[#242421] px-spacing-4 py-spacing-3 text-left transition hover:border-surface-warm-white/24 hover:bg-surface-warm-white/8"
                >
                  <span className="block text-sm font-semibold text-surface-warm-white">
                    {option.label}
                  </span>
                  <span className="mt-spacing-1 block text-xs leading-5 text-surface-warm-white/54">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-spacing-3 flex flex-wrap items-center gap-spacing-3 text-xs leading-5 text-surface-warm-white/54">
              <span>
                {hasError
                  ? "Opsi belum siap. Coba generate ulang."
                  : "Menyiapkan opsi pilihan..."}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isRefreshing}
                onClick={onRefresh}
                className="h-8 rounded-full border-surface-warm-white/12 bg-transparent text-xs text-surface-warm-white/78 hover:bg-surface-warm-white/8"
              >
                {isRefreshing ? "Menyiapkan..." : "Generate opsi"}
              </Button>
            </div>
          )}
        </div>
      ))}
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
    <div className="space-y-spacing-8">
      {messages.map((message, messageIndex) => (
        <div
          key={message.id || `${message.role}-${messageIndex}`}
          className={`flex max-w-full text-base leading-7 ${message.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[88%] overflow-hidden break-words [overflow-wrap:anywhere] rounded-[22px] px-spacing-6 py-spacing-5 ${message.role === "user" ? "border border-surface-warm-white/12 bg-[#30302c] text-surface-warm-white/88" : "border border-surface-warm-white/10 bg-[#242421] text-surface-warm-white/80"}`}
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
    <div className="space-y-spacing-4">
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

function getEditorLanguage(path = "") {
  if (path.endsWith(".tsx") || path.endsWith(".ts")) {
    return "typescript";
  }

  if (path.endsWith(".css")) {
    return "css";
  }

  if (path.endsWith(".json")) {
    return "json";
  }

  if (path.endsWith(".html")) {
    return "html";
  }

  if (path.endsWith(".md")) {
    return "markdown";
  }

  return "plaintext";
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
    <div className="grid h-full min-h-[680px] overflow-hidden border border-surface-warm-white/10 bg-[#10100f] text-surface-warm-white md:grid-cols-[280px_1fr]">
      <aside className="min-h-0 overflow-y-auto border-r border-surface-warm-white/10 p-spacing-5">
        <div className="flex items-center justify-between gap-spacing-4">
          <div>
            <p className="text-xs text-surface-warm-white/42">Source</p>
            <h2 className="mt-1 text-lg font-semibold">Code</h2>
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
      <section className="min-h-0 min-w-0">
        <div className="border-b border-surface-warm-white/10 px-spacing-5 py-spacing-4 text-sm text-surface-warm-white/54">
          {selectedFile?.path || "Belum ada file"}
        </div>
        <MonacoEditor
          height="640px"
          language={getEditorLanguage(selectedFile?.path)}
          value={selectedFile?.content || ""}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 22,
            padding: { top: 16, bottom: 16 },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            automaticLayout: true,
          }}
        />
      </section>
    </div>
  );
}

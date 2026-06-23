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
  ListChecks,
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
  useMemo,
  useRef,
  useState,
} from "react";

import { ProjectSitePreview } from "@/components/projects/renderer/ProjectSitePreview";
import { Button } from "@/components/ui/button";
import { createGeneratedProjectFiles } from "@/lib/projects/generated-source";
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

type BriefField = "goal" | "audience" | "style" | "features";

type BriefState = Partial<Record<BriefField, string>>;

type GuidedOption = {
  field: BriefField;
  id: string;
  label: string;
  description: string;
  recommended?: boolean;
};

const briefLabels: Record<BriefField, string> = {
  goal: "Tujuan",
  audience: "Target",
  style: "Style",
  features: "Fitur",
};

const guidedQuestions: Array<{
  field: BriefField;
  question: string;
  options: GuidedOption[];
}> = [
  {
    field: "goal",
    question: "Fokus utama websitenya apa?",
    options: [
      {
        field: "goal",
        id: "catalog",
        label: "Katalog + WhatsApp",
        description: "Tampilkan produk, lalu arahkan pelanggan untuk chat.",
        recommended: true,
      },
      {
        field: "goal",
        id: "brand",
        label: "Branding toko",
        description: "Bikin usaha terlihat lebih dipercaya dan rapi.",
      },
      {
        field: "goal",
        id: "campaign",
        label: "Promo/campaign",
        description: "Fokus ke penawaran atau launch produk tertentu.",
      },
      {
        field: "goal",
        id: "other",
        label: "Lainnya",
        description: "Saya mau jelaskan sendiri lewat chat.",
      },
    ],
  },
  {
    field: "audience",
    question: "Siapa pelanggan utama yang paling ingin ditarik?",
    options: [
      {
        field: "audience",
        id: "young",
        label: "Anak muda / mahasiswa",
        description: "Copy lebih santai, visual lebih berani.",
        recommended: true,
      },
      {
        field: "audience",
        id: "family",
        label: "Keluarga / umum",
        description: "Nada ramah, jelas, dan mudah dipercaya.",
      },
      {
        field: "audience",
        id: "premium",
        label: "Pembeli premium",
        description: "Tampilan lebih kurasi, tenang, dan detail.",
      },
      {
        field: "audience",
        id: "other",
        label: "Lainnya",
        description: "Saya tulis targetnya sendiri.",
      },
    ],
  },
  {
    field: "style",
    question: "Arah visualnya paling cocok yang mana?",
    options: [
      {
        field: "style",
        id: "clean",
        label: "Clean modern",
        description: "Rapi, ringan, mudah dibaca.",
      },
      {
        field: "style",
        id: "street",
        label: "Bold streetwear",
        description: "Lebih tajam, kontras, cocok fashion/barang second.",
        recommended: true,
      },
      {
        field: "style",
        id: "warm",
        label: "Lokal hangat",
        description: "Terasa dekat, sederhana, dan human.",
      },
      {
        field: "style",
        id: "other",
        label: "Lainnya",
        description: "Saya punya referensi sendiri.",
      },
    ],
  },
  {
    field: "features",
    question: "Fitur frontend apa yang paling penting dulu?",
    options: [
      {
        field: "features",
        id: "filter",
        label: "Katalog + filter",
        description:
          "Produk bisa difilter ukuran, kategori, kondisi, atau harga.",
        recommended: true,
      },
      {
        field: "features",
        id: "gallery",
        label: "Galeri + testimoni",
        description: "Fokus bukti visual dan kepercayaan.",
      },
      {
        field: "features",
        id: "simple",
        label: "Hero sederhana",
        description: "Satu halaman fokus, tidak terlalu banyak section.",
      },
      {
        field: "features",
        id: "other",
        label: "Lainnya",
        description: "Saya jelaskan fitur sendiri.",
      },
    ],
  },
];

type BuildTab = "preview" | "timeline" | "changes" | "code";

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
  const [chatWidth, setChatWidth] = useState(440);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [buildDetailsOpen, setBuildDetailsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<BuildTab>("preview");
  const [brief, setBrief] = useState<BriefState>({});
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

    setMode("build");
    setBuildError("");
    setBuildStatus("building");
    setBuildProgress([]);
    setActiveTab("timeline");

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

  const readiness = useMemo(() => {
    const completed = (Object.keys(brief) as BriefField[]).filter(
      (field) => brief[field],
    );
    return Math.min(100, Math.round(((1 + completed.length) / 5) * 100));
  }, [brief]);

  const generatedFiles = useMemo(
    () => createGeneratedProjectFiles(projectId, siteSchema),
    [projectId, siteSchema],
  );
  const nextQuestion = guidedQuestions.find(({ field }) => !brief[field]);
  const isResponding = status === "submitted" || status === "streaming";
  const isBuilding = buildStatus === "building";
  const chatDisabled = isResponding;

  function switchMode(nextMode: "build" | "discuss") {
    setMode(nextMode);

    if (nextMode === "build" && buildStatus === "discussing") {
      void startBuild();
    }
  }

  function handleOption(option: GuidedOption) {
    if (option.id === "other") {
      setMessage(
        `Untuk ${briefLabels[option.field].toLowerCase()}, saya mau: `,
      );
      return;
    }

    setBrief((current) => ({ ...current, [option.field]: option.label }));
    sendMessage(
      {
        text: `Saya pilih ${option.label} untuk ${briefLabels[option.field].toLowerCase()}.`,
      },
      { body: { mode: "discuss" } },
    );
  }

  function handleMessageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();

    if (!text || chatDisabled) {
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
      const next = startWidth - (pointerEvent.clientX - startX);
      setChatWidth(Math.min(620, Math.max(340, next)));
    }

    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#10100f] text-surface-warm-white">
      <div
        className="grid min-h-[calc(100dvh-4rem)] gap-0 lg:grid-cols-[minmax(0,1fr)_8px_var(--chat-width)]"
        style={{
          ["--chat-width" as string]: chatCollapsed ? "0px" : `${chatWidth}px`,
        }}
      >
        <section className="min-w-0 p-spacing-5 lg:p-spacing-7">
          <div className="flex h-full min-h-[780px] flex-col rounded-[32px] border border-surface-warm-white/10 bg-[#ebe8df] p-spacing-4 text-foreground-primary shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
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
                buildStatus === "discussing" ? (
                  <DiscussPreview onStartBuild={() => void startBuild()} />
                ) : (
                  <div className="flex justify-center">
                    <ProjectSitePreview
                      siteSchema={siteSchema}
                      viewport={viewport}
                    />
                  </div>
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
                <CodeView projectId={projectId} files={generatedFiles} />
              ) : null}
            </div>
          </div>
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={handleDividerPointerDown}
          className="hidden cursor-col-resize bg-transparent transition hover:bg-surface-warm-white/8 lg:block"
        />

        <aside
          className={`${chatCollapsed ? "hidden" : "flex"} min-h-[720px] flex-col border-l border-surface-warm-white/10 bg-[#171715] p-spacing-5 lg:flex`}
        >
          <div className="flex items-start justify-between gap-spacing-5">
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

          <div className="mt-spacing-6 flex rounded-full border border-surface-warm-white/10 bg-surface-warm-white/6 p-1 text-sm">
            <button
              type="button"
              onClick={() => switchMode("discuss")}
              className={`flex-1 rounded-full px-spacing-6 py-spacing-3 transition ${mode === "discuss" ? "bg-surface-warm-white text-foreground-primary" : "text-surface-warm-white/62 hover:text-surface-warm-white"}`}
            >
              Diskusi
            </button>
            <button
              type="button"
              onClick={() => switchMode("build")}
              className={`flex-1 rounded-full px-spacing-6 py-spacing-3 transition ${mode === "build" ? "bg-surface-warm-white text-foreground-primary" : "text-surface-warm-white/62 hover:text-surface-warm-white"}`}
            >
              Buat
            </button>
          </div>

          <div className="mt-spacing-6 flex-1 space-y-spacing-5 overflow-y-auto pr-1">
            <div className="rounded-[22px] bg-surface-warm-white px-spacing-6 py-spacing-5 text-sm leading-6 text-foreground-primary">
              {prompt}
            </div>

            {mode === "discuss" ? (
              <BriefReadinessCard
                readiness={readiness}
                brief={brief}
                onBuild={() => void startBuild()}
              />
            ) : null}

            <ChatMessages messages={messages} />

            {mode === "discuss" && nextQuestion ? (
              <GuidedQuestionCard
                question={nextQuestion.question}
                options={nextQuestion.options}
                onSelect={handleOption}
              />
            ) : null}

            {mode === "discuss" && !nextQuestion ? (
              <BuildReadyCard onBuild={() => void startBuild()} />
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
            <form
              onSubmit={handleMessageSubmit}
              className="mt-spacing-4 rounded-[26px] border border-surface-warm-white/10 bg-[#232321] p-spacing-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]"
            >
              <label htmlFor="workspace-message" className="sr-only">
                Pesan untuk AI
              </label>
              <textarea
                id="workspace-message"
                rows={3}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                disabled={chatDisabled}
                placeholder={
                  mode === "build"
                    ? "Minta perubahan, contoh: buat lebih premium..."
                    : "Jawab pilihan atau tulis kebutuhanmu..."
                }
                className="w-full resize-none bg-transparent px-spacing-3 py-spacing-3 text-sm leading-6 text-surface-warm-white outline-none [scrollbar-width:none] placeholder:text-surface-warm-white/38 disabled:opacity-60 [&::-webkit-scrollbar]:hidden"
              />
              <div className="flex items-center justify-between gap-spacing-4">
                <span className="text-xs text-surface-warm-white/42">
                  {mode === "discuss"
                    ? "Diskusi tidak akan membangun website."
                    : "Mode buat akan mengubah preview."}
                </span>
                <Button
                  type="submit"
                  size="icon"
                  disabled={!message.trim() || chatDisabled}
                  className="size-9 rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-50"
                  aria-label="Kirim pesan"
                >
                  <ArrowUp className="size-4" />
                </Button>
              </div>
            </form>
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

function DiscussPreview({ onStartBuild }: { onStartBuild: () => void }) {
  return (
    <div className="grid min-h-[620px] place-items-center rounded-[28px] bg-surface-warm-white p-spacing-10 text-center shadow-[0_18px_48px_rgba(28,28,28,0.12)]">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-text-secondary">
          Mode diskusi
        </p>
        <h2 className="mt-spacing-6 text-6xl font-semibold leading-none tracking-[-0.07em] text-foreground-primary">
          Website belum dibuat.
        </h2>
        <p className="mx-auto mt-spacing-7 max-w-xl text-lg leading-8 text-text-secondary">
          Jawab beberapa pilihan di chat kanan supaya AI tahu arah usaha, target
          pelanggan, style, dan fitur. Setelah brief siap, mulai build.
        </p>
        <Button
          type="button"
          onClick={onStartBuild}
          className="mt-spacing-9 rounded-radius-lg bg-foreground-primary px-spacing-9 text-surface-warm-white hover:bg-foreground-primary/90"
        >
          Build dengan asumsi sekarang
        </Button>
      </div>
    </div>
  );
}

function BriefReadinessCard({
  readiness,
  brief,
  onBuild,
}: {
  readiness: number;
  brief: BriefState;
  onBuild: () => void;
}) {
  const fields = Object.keys(briefLabels) as BriefField[];
  const ready = readiness >= 80;

  return (
    <div className="rounded-[22px] border border-surface-warm-white/10 bg-surface-warm-white/6 p-spacing-5">
      <div className="flex items-center justify-between gap-spacing-4">
        <div className="flex items-center gap-spacing-3 text-sm font-semibold">
          <ListChecks className="size-4" />
          Brief {readiness}% siap
        </div>
        {ready ? (
          <Button
            type="button"
            size="sm"
            onClick={onBuild}
            className="h-8 rounded-full bg-surface-warm-white px-spacing-5 text-xs text-foreground-primary hover:bg-surface-warm-white/86"
          >
            Mulai build
          </Button>
        ) : null}
      </div>
      <div className="mt-spacing-4 h-1.5 overflow-hidden rounded-full bg-surface-warm-white/10">
        <div
          className="h-full rounded-full bg-[#ff5e27] transition-all"
          style={{ width: `${readiness}%` }}
        />
      </div>
      <ul className="mt-spacing-4 grid gap-spacing-3 text-sm text-surface-warm-white/62">
        {fields.map((field) => (
          <li key={field} className="flex items-center gap-spacing-3">
            <CheckCircle2
              className={`size-4 ${brief[field] ? "text-[#ff5e27]" : "text-surface-warm-white/22"}`}
            />
            <span className="text-surface-warm-white/84">
              {briefLabels[field]}:
            </span>
            <span>{brief[field] || "belum jelas"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GuidedQuestionCard({
  question,
  options,
  onSelect,
}: {
  question: string;
  options: GuidedOption[];
  onSelect: (option: GuidedOption) => void;
}) {
  return (
    <div className="rounded-[24px] border border-[#ff5e27]/28 bg-[#ff5e27]/8 p-spacing-5">
      <p className="text-sm font-semibold text-surface-warm-white">
        {question}
      </p>
      <div className="mt-spacing-4 grid gap-spacing-3">
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option)}
            className="rounded-[18px] border border-surface-warm-white/10 bg-surface-warm-white/7 p-spacing-4 text-left text-sm transition hover:bg-surface-warm-white/12"
          >
            <span className="flex items-center justify-between gap-spacing-4 font-semibold text-surface-warm-white">
              <span>
                {String.fromCharCode(65 + index)}. {option.label}
              </span>
              {option.recommended ? (
                <span className="rounded-full bg-[#ff5e27] px-spacing-3 py-1 text-xs text-white">
                  Saran
                </span>
              ) : null}
            </span>
            <span className="mt-spacing-2 block leading-5 text-surface-warm-white/58">
              {option.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BuildReadyCard({ onBuild }: { onBuild: () => void }) {
  return (
    <div className="rounded-[24px] border border-[#8fd879]/30 bg-[#8fd879]/10 p-spacing-5">
      <p className="text-sm font-semibold text-surface-warm-white">
        Brief sudah cukup siap.
      </p>
      <p className="mt-spacing-2 text-sm leading-6 text-surface-warm-white/62">
        AI sudah punya arah dasar. Kamu bisa mulai build sekarang atau lanjut
        diskusi kalau masih mau mengubah detail.
      </p>
      <Button
        type="button"
        onClick={onBuild}
        className="mt-spacing-4 rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86"
      >
        Mulai build
      </Button>
    </div>
  );
}

function ChatMessages({ messages }: { messages: UIMessage[] }) {
  const assistantMessages = messages.filter(
    (message) => message.role === "assistant",
  );

  if (!assistantMessages.length) {
    return (
      <div className="rounded-[22px] border border-surface-warm-white/10 bg-surface-warm-white/6 px-spacing-6 py-spacing-5 text-sm leading-6 text-surface-warm-white/70">
        AI siap bantu merapikan brief. Pilih opsi di bawah atau tulis bebas.
      </div>
    );
  }

  return (
    <div className="space-y-spacing-4">
      {assistantMessages.map((message) => (
        <div
          key={message.id}
          className="rounded-[22px] border border-surface-warm-white/10 bg-surface-warm-white/6 px-spacing-6 py-spacing-5 text-sm leading-6 text-surface-warm-white/76"
        >
          {message.parts.map((part, index) =>
            part.type === "text" ? (
              <MessageText key={index} text={part.text} />
            ) : null,
          )}
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
            <p key={index} className="pl-spacing-4 text-surface-warm-white/72">
              <span className="text-[#ffb38d]">{listMatch[1]}</span>{" "}
              {formatInlineMarkdown(listMatch[2])}
            </p>
          );
        }

        if (trimmed.startsWith("###")) {
          return (
            <p key={index} className="font-semibold text-surface-warm-white">
              {formatInlineMarkdown(trimmed.replace(/^#+\s*/, ""))}
            </p>
          );
        }

        return <p key={index}>{formatInlineMarkdown(trimmed)}</p>;
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
}: {
  projectId: string;
  files: ReturnType<typeof createGeneratedProjectFiles>;
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

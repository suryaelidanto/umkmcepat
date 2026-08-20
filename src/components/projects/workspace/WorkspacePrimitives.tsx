"use client";

import {
  ChevronRight,
  Code2,
  ExternalLink,
  Globe2,
  Loader2,
  MessageSquarePlus,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Redo2,
  Send,
  Smartphone,
  Trash2,
  Undo2,
  X,
  LifeBuoy,
  RotateCw,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import { AuthButton } from "@/components/common/AuthButton";
import { EnergyDisplay } from "@/components/common/EnergyDisplay";
import { EnergyLedgerButton } from "@/components/common/EnergyLedgerButton";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { WorkspaceHistoryButton } from "@/components/projects/workspace/WorkspaceHistoryDrawer";
import { Button } from "@/components/ui/button";
import { MobileSheet } from "@/components/ui/mobile-sheet";
import { type WorkspaceCard } from "@/lib/projects/brief";
import { type VisualAnnotationDraft } from "@/lib/projects/visual-annotations";
import { cn } from "@/lib/utils";

export type BuildTab = "preview" | "code";

export {
  ImageUploadComposer,
  QuestionComposer,
} from "@/components/projects/chat/WorkspaceComposer";
export type { WorkspaceAnswerPayload } from "@/components/projects/chat/WorkspaceComposer";
export {
  GeneratedPreviewFrame,
  PreviewIssueState,
} from "@/components/projects/workspace/WorkspacePreview";
export {
  BuildProgressPanel,
  ProcessingControl,
} from "@/components/projects/build/WorkspaceBuildProgress";
export type { BuildProgressStep } from "@/components/projects/build/WorkspaceBuildProgress";

export type WorkspaceRuntimeControl = {
  canPublish?: boolean;
  hasUnpublishedPreview?: boolean;
  isPublishing?: boolean;
  onPublish?: () => void;
  publishedPath?: string | null;
  publishedState?: "live" | "not_live" | "unpublished";
};

export function WorkspaceTopBar({
  activeTab,
  setActiveTab,
  viewport,
  setViewport,
  chatCollapsed,
  openChatPanel,
  closeChatPanel,
  annotationAvailable = false,
  directEditActive = false,
  directEditFlagEnabled = true,
  onToggleDirectEdit,
  directEditActions,
  runtime,
  projectId,
  title: _title,
  onPickTab,
  onRefreshPreview,
}: {
  activeTab: BuildTab;
  setActiveTab: (tab: BuildTab) => void;
  viewport: "desktop" | "mobile";
  setViewport: (viewport: "desktop" | "mobile") => void;
  chatCollapsed: boolean;
  openChatPanel: () => void;
  closeChatPanel: () => void;
  annotationAvailable?: boolean;
  directEditActive?: boolean;
  directEditFlagEnabled?: boolean;
  onToggleDirectEdit?: () => void;
  directEditActions?: {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onSave: () => void;
    onDiscard: () => void;
  };
  runtime?: WorkspaceRuntimeControl;
  projectId?: string;
  title?: string;
  onPickTab?: (tab: BuildTab) => void;
  onRefreshPreview?: () => void;
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  return (
    <>
      <div className="hidden min-h-14 flex-wrap items-center justify-between gap-spacing-2 border-b border-black/10 bg-[#eceae4] px-spacing-3 py-spacing-2 text-[#1c1c1c] transition-colors duration-200 dark:border-surface-warm-white/10 dark:bg-[#171715] dark:text-surface-warm-white sm:flex sm:h-14 sm:flex-nowrap sm:gap-spacing-4 sm:px-spacing-4 sm:py-0">
        <div className="hidden min-w-0 items-center justify-start gap-spacing-3 sm:flex sm:w-auto">
          <button
            type="button"
            onClick={chatCollapsed ? openChatPanel : closeChatPanel}
            className="hidden h-9 w-9 items-center justify-center rounded-radius-md border border-black/10 p-spacing-2 text-[#5f5f5d] hover:bg-black/5 hover:text-[#1c1c1c] dark:border-surface-warm-white/10 dark:text-surface-warm-white/70 dark:hover:bg-surface-warm-white/8 dark:hover:text-surface-warm-white md:inline-flex cursor-pointer"
            aria-label={chatCollapsed ? "Buka chat" : "Tutup chat"}
          >
            {chatCollapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
          <div
            role="tablist"
            aria-label="Konten tampilan"
            className="hidden md:flex h-9 items-center rounded-radius-md border border-black/10 bg-black/5 p-0.5 text-xs dark:border-surface-warm-white/10 dark:bg-surface-warm-white/5"
          >
            <TabButton
              active={activeTab === "preview"}
              id="workspace-preview-tab"
              controls="workspace-preview-panel"
              onClick={() => setActiveTab("preview")}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  setActiveTab("code");
                  (
                    event.currentTarget.nextElementSibling as HTMLElement
                  )?.focus();
                }
              }}
              icon={<Globe2 className="size-4" />}
              layoutId="workspace-active-tab"
            >
              Tampilan
            </TabButton>
            <TabButton
              active={activeTab === "code"}
              id="workspace-code-tab"
              controls="workspace-code-panel"
              onClick={() => setActiveTab("code")}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  setActiveTab("preview");
                  (
                    event.currentTarget.previousElementSibling as HTMLElement
                  )?.focus();
                }
              }}
              icon={<Code2 className="size-4" />}
              layoutId="workspace-active-tab"
            >
              Kode
            </TabButton>
          </div>

          {activeTab === "preview" ? (
            <>
              <div className="hidden h-4 w-px bg-black/10 dark:bg-surface-warm-white/10 md:block" />
              <div
                role="tablist"
                aria-label="Tampilan viewport"
                className="hidden md:flex h-9 items-center rounded-radius-md border border-black/10 bg-black/5 p-0.5 text-xs dark:border-surface-warm-white/10 dark:bg-surface-warm-white/5"
              >
                <TabButton
                  active={viewport === "desktop"}
                  id="viewport-desktop-tab"
                  controls="workspace-preview-panel"
                  onClick={() => setViewport("desktop")}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowRight") {
                      event.preventDefault();
                      setViewport("mobile");
                      (
                        event.currentTarget.nextElementSibling as HTMLElement
                      )?.focus();
                    }
                  }}
                  icon={<Monitor className="size-4" />}
                  layoutId="workspace-viewport-tab"
                >
                  Komputer
                </TabButton>
                <TabButton
                  active={viewport === "mobile"}
                  id="viewport-mobile-tab"
                  controls="workspace-preview-panel"
                  onClick={() => setViewport("mobile")}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      setViewport("desktop");
                      (
                        event.currentTarget
                          .previousElementSibling as HTMLElement
                      )?.focus();
                    }
                  }}
                  icon={<Smartphone className="size-4" />}
                  layoutId="workspace-viewport-tab"
                >
                  HP
                </TabButton>
              </div>
              {onRefreshPreview ? (
                <button
                  type="button"
                  onClick={onRefreshPreview}
                  className="hidden md:inline-flex size-9 items-center justify-center rounded-radius-md border border-black/10 text-[#5f5f5d] hover:bg-black/5 hover:text-[#1c1c1c] dark:border-surface-warm-white/10 dark:text-surface-warm-white/70 dark:hover:bg-surface-warm-white/8 dark:hover:text-surface-warm-white cursor-pointer transition-colors"
                  aria-label="Muat ulang tampilan website"
                  title="Muat ulang tampilan"
                >
                  <RotateCw className="size-3.5" />
                </button>
              ) : null}
            </>
          ) : null}
          {annotationAvailable &&
          activeTab === "preview" &&
          directEditFlagEnabled ? (
            <button
              type="button"
              onClick={onToggleDirectEdit}
              aria-label={
                directEditActive
                  ? "Nonaktifkan mode tunjuk & ubah"
                  : "Aktifkan mode tunjuk & ubah"
              }
              aria-pressed={directEditActive}
              className={`hidden md:inline-flex h-9 items-center gap-spacing-2 rounded-radius-md border px-spacing-3 py-spacing-2 text-xs transition cursor-pointer ${directEditActive ? "border-[#8fd3ff]/35 bg-[#8fd3ff]/12 text-[#d6f0ff]" : "border-surface-warm-white/10 bg-surface-warm-white/5 text-surface-warm-white/64 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"}`}
            >
              <MessageSquarePlus className="size-4" />
              <span className="hidden sm:inline">
                {directEditActive ? "Mode Tunjuk Aktif" : "Tunjuk & Ubah"}
              </span>
            </button>
          ) : null}
        </div>

        {/* Mobile menu trigger hidden anchor */}
        <button
          id="mobile-workspace-menu-btn"
          type="button"
          aria-label="Buka menu"
          aria-haspopup="dialog"
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen(true)}
          className="hidden"
        />

        {/* Desktop cluster (unchanged) */}
        <div className="hidden min-w-0 w-full items-center justify-between gap-spacing-2 sm:flex sm:w-auto sm:shrink-0 sm:justify-end sm:gap-spacing-3">
          {directEditFlagEnabled && directEditActive && directEditActions ? (
            <div className="flex items-center gap-spacing-1">
              <button
                type="button"
                aria-label="Undo"
                disabled={!directEditActions.canUndo}
                onClick={directEditActions.onUndo}
                className="grid size-8 place-items-center rounded-radius-sm border border-surface-warm-white/15 text-surface-warm-white/85 hover:bg-surface-warm-white/10 disabled:opacity-40"
              >
                <Undo2 className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Redo"
                disabled={!directEditActions.canRedo}
                onClick={directEditActions.onRedo}
                className="grid size-8 place-items-center rounded-radius-sm border border-surface-warm-white/15 text-surface-warm-white/85 hover:bg-surface-warm-white/10 disabled:opacity-40"
              >
                <Redo2 className="size-4" />
              </button>
              <Button
                type="button"
                size="sm"
                onClick={directEditActions.onSave}
                className="h-8 rounded-radius-md bg-[#0d9488] px-spacing-3 text-xs text-white hover:bg-[#0f766e]"
              >
                Simpan
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={directEditActions.onDiscard}
                className="h-8 rounded-radius-md border-surface-warm-white/20 bg-transparent text-xs text-surface-warm-white/80 hover:bg-surface-warm-white/8"
              >
                Batalkan
              </Button>
            </div>
          ) : null}
          {projectId ? <WorkspaceHistoryButton projectId={projectId} /> : null}
          {projectId ? <EnergyLedgerButton projectId={projectId} /> : null}
          {runtime ? <RuntimeControl runtime={runtime} /> : null}

          <div className="hidden h-4 w-px bg-black/10 dark:bg-surface-warm-white/10 sm:block" />

          <EnergyDisplay />
          <ThemeToggle />
          <AuthButton />
        </div>
      </div>
      <MobileSheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <MobileMenuContent
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          viewport={viewport}
          setViewport={setViewport}
          annotationAvailable={annotationAvailable}
          directEditActive={directEditActive}
          directEditFlagEnabled={directEditFlagEnabled}
          onToggleDirectEdit={onToggleDirectEdit}
          runtime={runtime}
          projectId={projectId}
          onPickTab={onPickTab}
          onClose={() => setIsMobileMenuOpen(false)}
        />
      </MobileSheet>
    </>
  );
}

function TabButton({
  active,
  controls,
  id,
  onClick,
  onKeyDown,
  icon,
  children,
  layoutId,
}: {
  active: boolean;
  controls: string;
  id: string;
  onClick: () => void;
  onKeyDown: React.KeyboardEventHandler<HTMLButtonElement>;
  icon: React.ReactNode;
  children: React.ReactNode;
  layoutId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className="relative flex h-8 items-center gap-spacing-2 rounded-radius-sm px-spacing-3 py-spacing-1.5 transition text-xs font-medium focus-visible:outline-none cursor-pointer"
    >
      {active && (
        <motion.span
          layoutId={layoutId}
          className="absolute inset-0 rounded-radius-sm bg-black/10 dark:bg-surface-warm-white/10"
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      )}
      <span
        className={cn(
          "relative z-10 flex items-center gap-spacing-2",
          active
            ? "text-[#1c1c1c] dark:text-surface-warm-white"
            : "text-[#5f5f5d] hover:text-[#1c1c1c] dark:text-surface-warm-white/58 dark:hover:text-surface-warm-white",
        )}
      >
        {icon}
        {children}
      </span>
    </button>
  );
}

type MobileMenuContentProps = {
  activeTab: BuildTab;
  setActiveTab: (tab: BuildTab) => void;
  viewport: "desktop" | "mobile";
  setViewport: (viewport: "desktop" | "mobile") => void;
  annotationAvailable: boolean;
  directEditActive: boolean;
  directEditFlagEnabled: boolean;
  onToggleDirectEdit?: () => void;
  runtime?: WorkspaceRuntimeControl;
  projectId?: string;
  onPickTab?: (tab: BuildTab) => void;
  onClose: () => void;
};

export function MobileMenuContent({
  activeTab,
  setActiveTab,
  viewport,
  setViewport,
  annotationAvailable,
  directEditActive,
  directEditFlagEnabled,
  onToggleDirectEdit,
  runtime,
  projectId,
  onPickTab,
  onClose,
}: MobileMenuContentProps) {
  void viewport;
  void setViewport;
  const pickTab = (tab: BuildTab) => {
    if (onPickTab) {
      onPickTab(tab);
    } else {
      setActiveTab(tab);
    }
  };

  return (
    <div className="flex flex-col gap-spacing-5 text-[#1c1c1c] dark:text-surface-warm-white">
      <section className="flex flex-col gap-spacing-2">
        <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-[#5f5f5d] dark:text-surface-warm-white/44">
          Navigasi Tampilan
        </span>
        <div
          role="tablist"
          aria-label="Konten tampilan"
          className="flex h-9 w-full items-center rounded-radius-md border border-black/10 bg-black/5 p-0.5 text-xs dark:border-surface-warm-white/10 dark:bg-surface-warm-white/5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "preview"}
            onClick={() => pickTab("preview")}
            className={`relative flex h-8 flex-1 items-center justify-center gap-spacing-2 rounded-radius-sm transition cursor-pointer ${activeTab === "preview" ? "bg-white font-semibold text-[#1c1c1c] shadow-xs dark:bg-surface-warm-white/10 dark:text-surface-warm-white" : "text-[#5f5f5d] hover:text-[#1c1c1c] dark:text-surface-warm-white/58 dark:hover:text-surface-warm-white"}`}
          >
            <Globe2 className="size-4" />
            <span>Tampilan</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "code"}
            onClick={() => pickTab("code")}
            className={`relative flex h-8 flex-1 items-center justify-center gap-spacing-2 rounded-radius-sm transition cursor-pointer ${activeTab === "code" ? "bg-white font-semibold text-[#1c1c1c] shadow-xs dark:bg-surface-warm-white/10 dark:text-surface-warm-white" : "text-[#5f5f5d] hover:text-[#1c1c1c] dark:text-surface-warm-white/58 dark:hover:text-surface-warm-white"}`}
          >
            <Code2 className="size-4" />
            <span>Kode</span>
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-spacing-2">
        <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-[#5f5f5d] dark:text-surface-warm-white/44">
          Aksi
        </span>
        <div className="flex flex-col gap-spacing-1">
          {annotationAvailable &&
          activeTab === "preview" &&
          directEditFlagEnabled ? (
            <button
              type="button"
              onClick={() => {
                onToggleDirectEdit?.();
                onClose();
              }}
              aria-pressed={directEditActive}
              aria-label={
                directEditActive ? "Nonaktifkan ubah" : "Aktifkan ubah"
              }
              className={`inline-flex h-11 w-full items-center gap-spacing-3 rounded-radius-md px-spacing-3 text-sm cursor-pointer ${directEditActive ? "bg-[#8fd3ff]/12 text-[#d6f0ff]" : "text-[#1c1c1c] hover:bg-black/5 dark:text-surface-warm-white/82 dark:hover:bg-surface-warm-white/8"}`}
            >
              <MessageSquarePlus
                className={`size-4 shrink-0 ${directEditActive ? "text-[#8fd3ff]" : "text-[#5f5f5d] dark:text-surface-warm-white/64"}`}
              />
              <span className="flex-1 text-left">
                {directEditActive ? "Ubah aktif" : "Ubah"}
              </span>
            </button>
          ) : null}
          {projectId ? (
            <WorkspaceHistoryButton
              onActivate={onClose}
              projectId={projectId}
              variant="row"
            />
          ) : null}
          {projectId ? (
            <EnergyLedgerButton
              onActivate={onClose}
              projectId={projectId}
              variant="row"
            />
          ) : null}
          {projectId ? (
            <a
              href="/support"
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="inline-flex h-11 w-full items-center gap-spacing-3 rounded-radius-md px-spacing-3 text-sm text-[#1c1c1c] hover:bg-black/5 dark:text-surface-warm-white/82 dark:hover:bg-surface-warm-white/8"
            >
              <LifeBuoy className="size-4 shrink-0 text-[#5f5f5d] dark:text-surface-warm-white/64" />
              <span className="flex-1 text-left">Hubungi Dukungan</span>
              <ChevronRight className="size-4 text-black/30 dark:text-surface-warm-white/40" />
            </a>
          ) : null}
          {runtime ? (
            <RuntimeControl
              onActivate={onClose}
              runtime={runtime}
              variant="row"
            />
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-spacing-2 pt-2 border-t border-black/10 dark:border-surface-warm-white/10">
        <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-[#5f5f5d] dark:text-surface-warm-white/44">
          Akun & Tema
        </span>
        <div className="flex items-center justify-between rounded-xl px-1">
          <EnergyDisplay />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <AuthButton />
          </div>
        </div>
      </section>
    </div>
  );
}

function RuntimeControl({
  runtime,
  variant = "pill",
  onActivate,
}: {
  runtime: WorkspaceRuntimeControl;
  variant?: "pill" | "row";
  onActivate?: () => void;
}) {
  const publishLabel = runtime.isPublishing
    ? "Menerbitkan..."
    : runtime.publishedPath
      ? "Terbitkan versi ini"
      : "Terbitkan";
  const publishAriaLabel = runtime.isPublishing
    ? "Sedang menerbitkan website..."
    : runtime.publishedPath
      ? "Terbitkan versi Preview ini ke Production"
      : "Terbitkan website ke domain publik";
  const publishButton = (
    <button
      type="button"
      disabled={!runtime.canPublish || runtime.isPublishing}
      onClick={() => {
        runtime.onPublish?.();
        onActivate?.();
      }}
      aria-label={publishAriaLabel}
      className="inline-flex h-11 w-full items-center justify-center gap-spacing-2 rounded-radius-md bg-[#1c1c1c] px-spacing-4 text-sm font-semibold text-white shadow-xs hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-surface-warm-white dark:text-foreground-primary dark:hover:bg-surface-warm-white/90"
    >
      {runtime.isPublishing ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Globe2 className="size-4" />
      )}
      <span>{publishLabel}</span>
    </button>
  );

  if (variant === "row") {
    return (
      <div className="flex w-full flex-col gap-spacing-2">
        {runtime.publishedPath && runtime.publishedState === "not_live" ? (
          <span className="inline-flex h-11 w-full items-center justify-center rounded-radius-md border border-amber-400/20 bg-amber-400/10 px-spacing-4 text-sm font-semibold text-amber-200">
            Website tidak live
          </span>
        ) : runtime.publishedPath ? (
          <a
            href={runtime.publishedPath}
            target="_blank"
            rel="noreferrer"
            onClick={onActivate}
            aria-label="Buka website yang diterbitkan"
            className="inline-flex h-11 w-full items-center justify-center gap-spacing-2 rounded-radius-md bg-[#1c1c1c] px-spacing-4 text-sm font-semibold text-white shadow-xs hover:bg-black dark:bg-surface-warm-white dark:text-foreground-primary dark:hover:bg-surface-warm-white/90"
          >
            <ExternalLink className="size-4" />
            <span>Buka website</span>
          </a>
        ) : null}
        {runtime.hasUnpublishedPreview ? publishButton : null}
        {!runtime.publishedPath ? publishButton : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-spacing-1 sm:gap-spacing-2">
      {runtime.publishedPath && runtime.publishedState === "not_live" ? (
        <span className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 text-xs font-semibold text-amber-200">
          Tidak live
        </span>
      ) : runtime.publishedPath ? (
        <>
          <a
            href={runtime.publishedPath}
            target="_blank"
            rel="noreferrer"
            aria-label="Buka website yang diterbitkan"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#1c1c1c] px-3 text-xs font-semibold text-white shadow-xs transition hover:bg-black dark:bg-surface-warm-white dark:text-foreground-primary dark:hover:bg-white"
          >
            <ExternalLink className="size-3.5" />
            <span>Buka Website</span>
          </a>
          {runtime.hasUnpublishedPreview ? (
            <button
              type="button"
              disabled={!runtime.canPublish || runtime.isPublishing}
              onClick={runtime.onPublish}
              aria-label={publishAriaLabel}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#1c1c1c] px-3 text-xs font-semibold text-white shadow-xs transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-surface-warm-white dark:text-foreground-primary dark:hover:bg-white"
            >
              {runtime.isPublishing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Globe2 className="size-3.5" />
              )}
              <span>{publishLabel}</span>
            </button>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          disabled={!runtime.canPublish || runtime.isPublishing}
          onClick={runtime.onPublish}
          aria-label={publishAriaLabel}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#1c1c1c] px-3 text-xs font-semibold text-white shadow-xs transition hover:bg-black active:scale-95 disabled:cursor-not-allowed disabled:bg-black/5 disabled:text-black/30 disabled:hover:bg-black/5 dark:bg-surface-warm-white dark:text-foreground-primary dark:hover:bg-surface-warm-white/90 dark:disabled:bg-white/5 dark:disabled:text-white/30 cursor-pointer"
        >
          {runtime.isPublishing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Globe2 className="size-3.5" />
          )}
          <span>{publishLabel}</span>
        </button>
      )}
    </div>
  );
}

export function VisualFeedbackWidget({
  annotations,
  instruction,
  isSending,
  onClose,
  onInstructionChange,
  onRemove,
  onSend,
}: {
  annotations: VisualAnnotationDraft[];
  instruction: string;
  isSending: boolean;
  onClose: () => void;
  onInstructionChange: (value: string) => void;
  onRemove: (id: string) => void;
  onSend: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!annotations.length) {
    return null;
  }

  return (
    <div className="fixed bottom-spacing-7 right-spacing-7 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-[22px] border border-surface-warm-white/12 bg-[#191916]/96 text-surface-warm-white shadow-[0_18px_60px_rgba(0,0,0,0.42)] backdrop-blur">
      <div className="flex items-center gap-spacing-3 p-spacing-3">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-spacing-3 rounded-[14px] px-spacing-2 text-left hover:bg-surface-warm-white/6"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-warm-white text-sm font-bold text-foreground-primary">
            {annotations.length}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {annotations.length === 1
                ? "1 komentar siap"
                : `${annotations.length} komentar siap`}
            </span>
            <span className="block text-xs text-surface-warm-white/48">
              {open ? "Tutup ringkasan" : "Tinjau sebelum revisi"}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onClose();
          }}
          className="grid size-11 shrink-0 place-items-center rounded-full text-surface-warm-white/52 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
          aria-label="Tutup mode komentar"
        >
          <X className="size-4" />
        </button>
      </div>
      {open ? (
        <div className="border-t border-surface-warm-white/8 px-spacing-4 pb-spacing-4 pt-spacing-3">
          <div className="max-h-56 space-y-spacing-2 overflow-y-auto pr-spacing-1 [scrollbar-width:thin]">
            {annotations.map((annotation, index) => (
              <article
                key={annotation.id}
                className="flex items-start gap-spacing-3 rounded-[14px] bg-surface-warm-white/[0.045] p-spacing-3"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-warm-white text-xs font-bold text-foreground-primary">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">
                    {annotation.label}
                  </p>
                  <p className="mt-spacing-1 line-clamp-2 text-xs leading-5 text-surface-warm-white/58">
                    {annotation.comment}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(annotation.id)}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-surface-warm-white/50 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
                  aria-label={`Hapus komentar ${index + 1}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </article>
            ))}
          </div>
          <label
            htmlFor="visual-feedback-instruction"
            className="mt-spacing-4 block text-xs font-medium text-surface-warm-white/58"
          >
            Catatan tambahan <span className="font-normal">(opsional)</span>
          </label>
          <textarea
            id="visual-feedback-instruction"
            rows={3}
            maxLength={1000}
            value={instruction}
            onChange={(event) => onInstructionChange(event.target.value)}
            placeholder="Contoh: bikin keseluruhan lebih rapi dan tenang..."
            className="mt-spacing-2 w-full resize-none rounded-[14px] border border-surface-warm-white/10 bg-[#111110] px-spacing-4 py-spacing-3 text-sm leading-6 text-surface-warm-white outline-none placeholder:text-surface-warm-white/38 focus:border-surface-warm-white/30"
          />
          <Button
            type="button"
            disabled={isSending}
            onClick={onSend}
            className="mt-spacing-3 h-11 w-full rounded-[12px] bg-surface-warm-white text-sm text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-45"
          >
            {isSending ? (
              "Mengirim revisi..."
            ) : (
              <>
                <Send className="size-4" />
                Kirim revisi
              </>
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function EmptyPreviewState() {
  return (
    <div className="grid min-h-full place-items-center bg-[#f7f4ed] p-spacing-10 text-center text-[#1c1c1c] transition-colors duration-200 dark:bg-[#10100f] dark:text-surface-warm-white">
      <div>
        <h2 className="text-3xl font-semibold tracking-[-0.05em] text-[#1c1c1c] dark:text-surface-warm-white">
          Belum ada tampilan website
        </h2>
        <p className="mx-auto mt-spacing-4 max-w-md text-sm leading-6 text-[#5f5f5d] dark:text-surface-warm-white/50">
          Tampilan website akan muncul setelah brief cukup jelas dan proses
          pembuatan selesai.
        </p>
      </div>
    </div>
  );
}

export function WorkspaceCardView({
  buildComplete = false,
  canBuild = true,
  card,
  onBuild,
  onDiscuss,
}: {
  buildComplete?: boolean;
  card: WorkspaceCard;
  canBuild?: boolean;
  onBuild: () => void;
  onDiscuss?: () => void;
}) {
  if (card.type === "none") {
    return null;
  }

  if (card.type === "build_recommendation") {
    return (
      <div className="rounded-2xl border border-black/10 bg-[#fcfbf8] px-spacing-5 py-spacing-5 shadow-sm transition-colors duration-200 dark:border-surface-warm-white/10 dark:bg-[#1b1b18] dark:shadow-none">
        <div className="grid items-start gap-spacing-5 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold leading-6 text-[#1c1c1c] dark:text-surface-warm-white">
              {card.title}
            </h2>
            <ul className="mt-spacing-4 divide-y divide-black/5 text-sm leading-6 text-[#5f5f5d] dark:divide-surface-warm-white/8 dark:text-surface-warm-white/66">
              {card.summary.slice(0, 7).map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className="break-words py-spacing-3 first:pt-0 last:pb-0 [overflow-wrap:anywhere]"
                >
                  {item}
                </li>
              ))}
            </ul>
            {!canBuild ? (
              <p className="mt-spacing-4 rounded-[12px] border border-amber-500/24 bg-amber-500/[0.06] px-spacing-4 py-spacing-3 text-sm leading-6 text-[#1c1c1c] dark:text-surface-warm-white/82">
                Ada informasi yang masih perlu dilengkapi. Lanjutkan diskusi
                dulu sebelum membuat website.
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-spacing-3 md:mt-spacing-6 md:flex-col md:items-stretch">
            <Button
              type="button"
              disabled={!canBuild}
              onClick={onBuild}
              className="rounded-[12px] bg-[#1c1c1c] px-spacing-5 text-white hover:bg-black disabled:opacity-50 dark:bg-surface-warm-white dark:text-foreground-primary dark:hover:bg-surface-warm-white/86"
            >
              {buildComplete ? "Perbarui website" : "Mulai buat website"}
            </Button>
            {onDiscuss ? (
              <Button
                type="button"
                variant="outline"
                onClick={onDiscuss}
                className="rounded-[12px] border-black/15 bg-transparent px-spacing-5 text-[#5f5f5d] hover:bg-black/5 hover:text-[#1c1c1c] dark:border-surface-warm-white/12 dark:text-surface-warm-white/78 dark:hover:bg-surface-warm-white/8"
              >
                Lanjut diskusi dulu
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (card.type === "build_retry") {
    return (
      <div className="rounded-2xl border border-amber-500/20 bg-[#fcfbf8] px-spacing-5 py-spacing-5 shadow-sm transition-colors duration-200 dark:border-amber-500/15 dark:bg-[#1b1b18] dark:shadow-none">
        <div className="grid items-start gap-spacing-5 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold leading-6 text-[#1c1c1c] dark:text-surface-warm-white">
              {card.title}
            </h2>
            <p className="mt-spacing-2 text-sm leading-6 text-[#5f5f5d] dark:text-surface-warm-white/66">
              {card.errorMessage ||
                "Bangunnya belum berhasil — bukan salahmu. Coba lagi atau perbaiki brief dulu."}
            </p>
            {card.summary.length > 0 ? (
              <ul className="mt-spacing-4 divide-y divide-black/5 text-sm leading-6 text-[#5f5f5d] dark:divide-surface-warm-white/8 dark:text-surface-warm-white/66">
                {card.summary.slice(0, 7).map((item, index) => (
                  <li
                    key={`${item}-${index}`}
                    className="break-words py-spacing-3 first:pt-0 last:pb-0 [overflow-wrap:anywhere]"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-spacing-3 md:mt-spacing-6 md:flex-col md:items-stretch">
            <Button
              type="button"
              disabled={!canBuild}
              onClick={onBuild}
              className="rounded-[12px] bg-[#1c1c1c] px-spacing-5 text-white hover:bg-black disabled:opacity-50 dark:bg-surface-warm-white dark:text-foreground-primary dark:hover:bg-surface-warm-white/86"
            >
              Coba bangun lagi
            </Button>
            {onDiscuss ? (
              <Button
                type="button"
                variant="outline"
                onClick={onDiscuss}
                className="rounded-[12px] border-black/15 bg-transparent px-spacing-5 text-[#5f5f5d] hover:bg-black/5 hover:text-[#1c1c1c] dark:border-surface-warm-white/12 dark:text-surface-warm-white/78 dark:hover:bg-surface-warm-white/8"
              >
                Perbaiki brief dulu
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

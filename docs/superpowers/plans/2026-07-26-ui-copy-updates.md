# UI Enhancements, Mode Switchers & Auto-scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize the segmented tab switches (Tampilan/Kode, Komputer/HP, Pilihan/Tulis Bebas) with a sliding active background and unified size; simplify the build preview loader to a clean spinner; collapse directory folders by default in the code view; add a "Lompat ke Bawah" auto-scroll button; and add the missing paperclip attachment button to the default chat composer.

**Architecture:** 
- Leverage `framer-motion`'s `layoutId` on absolute-positioned inner sliding backgrounds inside standardized flex containers to achieve a smooth segmented control sliding transition.
- Use React state hooks (`onScroll`) and ref references (`shouldStickToBottomRef`) to detect scroll offset and toggle the visibility of the "Lompat ke Bawah" button.
- Clean up the preview-pane loading state by rendering a simple Spinner indicator, leaving granular progress reporting exclusively in the chat view.

**Tech Stack:** React 19, Tailwind CSS v4, Lucide React icons, Framer Motion, TypeScript, TanStack Router.

## Global Constraints
- Use Bun only. Lockfile: `bun.lock`.
- Keep modifications highly localized and surgical to prevent side effects in the workspace layout.
- The terms and copy updates are excluded from this work.
- The project card missing issue is excluded from this work.
- Pre-commit checks must pass clean (`bun run check`).

---

### Task 1: Commit Pre-existing Build Policy Fix
*Note: The previous agent implemented a fix for the config normalization issue on build mode edits in `generated-build-policy.ts` and `generated-build-policy.test.ts` but left the files unstaged.*

**Files:**
- Modify: `src/lib/projects/generated-build-policy.ts` (already modified locally)
- Modify: `src/lib/projects/generated-build-policy.test.ts` (already modified locally)

**Interfaces:**
- Consumes: None
- Produces: None

- [ ] **Step 1: Check git diff to ensure changes are clean**
  Run: `git diff src/lib/projects/generated-build-policy.ts`
  Expected: Shows the normalization changes using quote replacement and whitespace collapsing.

- [ ] **Step 2: Run test suite to verify the build policy fix is green**
  Run: `bun test src/lib/projects/generated-build-policy.test.ts`
  Expected: All tests pass.

- [ ] **Step 3: Stage and commit the build policy files**
  Run:
  ```bash
  git add src/lib/projects/generated-build-policy.ts src/lib/projects/generated-build-policy.test.ts
  git commit -m "fix(gen): normalize vite config quotes and semicolons in build validation"
  ```

---

### Task 2: Standardize TabButton and WorkspaceTopBar Toggles
*Standardize "Tampilan" vs "Kode" and "Komputer" vs "HP" toggles to be h-9/h-8 sliding tab controls, and make all other top bar buttons h-9/w-9/px-3 to align heights.*

**Files:**
- Modify: `src/components/projects/WorkspacePrimitives.tsx`

**Interfaces:**
- Consumes: None
- Produces: `TabButton`, `WorkspaceTopBar` components with updated layout properties.

- [ ] **Step 1: Edit `TabButton` to add sliding animation and relative sizing**
  Modify: `src/components/projects/WorkspacePrimitives.tsx` around line 195. Replace `TabButton` and add `layoutId` prop:
  ```tsx
  import { motion } from "framer-motion";

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
            className="absolute inset-0 rounded-radius-sm bg-surface-warm-white"
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        )}
        <span className={cn("relative z-10 flex items-center gap-spacing-2", active ? "text-foreground-primary" : "text-surface-warm-white/58 hover:text-surface-warm-white")}>
          {icon}
          {children}
        </span>
      </button>
    );
  }
  ```

- [ ] **Step 2: Update `WorkspaceTopBar` buttons & segmented control containers to match h-9 height**
  Modify: `src/components/projects/WorkspacePrimitives.tsx` around line 88.
  - Change the left panel collapse button height from `min-h-11 min-w-11` to `h-9 w-9`.
  - Update the "Tampilan / Kode" container class to include `h-9 items-center p-0.5` instead of `p-1`. Pass `layoutId="workspace-active-tab"` to both `TabButton` components.
  - Update the "Ubah" (annotation) button height from `min-h-11` to `h-9` and spacing to `px-3`.
  - Update the right panel button height in `RuntimeControl` (Buka and Terbitkan) from `min-h-11 min-w-11` to `h-9 px-3`.
  - Change the "Komputer / HP" button container from raw `<button>` elements to `TabButton` elements inside a `role="tablist"` container using `layoutId="workspace-viewport-tab"`.
  
  Replace `WorkspaceTopBar` in `WorkspacePrimitives.tsx` with:
  ```tsx
  export function WorkspaceTopBar({
    activeTab,
    setActiveTab,
    viewport,
    setViewport,
    chatCollapsed,
    openChatPanel,
    closeChatPanel,
    annotationActive = false,
    annotationAvailable = false,
    onToggleAnnotation,
    runtime,
    projectId,
  }: {
    activeTab: BuildTab;
    setActiveTab: (tab: BuildTab) => void;
    viewport: "desktop" | "mobile";
    setViewport: (viewport: "desktop" | "mobile") => void;
    chatCollapsed: boolean;
    openChatPanel: () => void;
    closeChatPanel: () => void;
    annotationActive?: boolean;
    annotationAvailable?: boolean;
    onToggleAnnotation?: () => void;
    runtime?: WorkspaceRuntimeControl;
    projectId?: string;
  }) {
    return (
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-spacing-2 border-b border-surface-warm-white/10 bg-[#171715] px-spacing-3 py-spacing-2 sm:h-14 sm:flex-nowrap sm:gap-spacing-4 sm:px-spacing-4 sm:py-0">
        <div className="flex min-w-0 w-full items-center justify-between gap-spacing-2 sm:w-auto sm:justify-start sm:gap-spacing-3">
          <button
            type="button"
            onClick={chatCollapsed ? openChatPanel : closeChatPanel}
            className="hidden h-9 w-9 items-center justify-center rounded-radius-md border border-surface-warm-white/10 p-spacing-2 text-surface-warm-white/70 hover:bg-surface-warm-white/8 hover:text-surface-warm-white md:inline-flex cursor-pointer"
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
            className="flex h-9 items-center rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-0.5 text-xs"
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
          {annotationAvailable && activeTab === "preview" ? (
            <button
              type="button"
              onClick={onToggleAnnotation}
              aria-label={annotationActive ? "Nonaktifkan ubah" : "Aktifkan ubah"}
              aria-pressed={annotationActive}
              className={`inline-flex h-9 items-center gap-spacing-2 rounded-radius-md border px-spacing-3 py-spacing-2 text-xs transition cursor-pointer ${annotationActive ? "border-[#8fd3ff]/35 bg-[#8fd3ff]/12 text-[#d6f0ff]" : "border-surface-warm-white/10 bg-surface-warm-white/5 text-surface-warm-white/64 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"}`}
            >
              <MessageSquarePlus className="size-4" />
              <span className="hidden sm:inline">
                {annotationActive ? "Ubah aktif" : "Ubah"}
              </span>
            </button>
          ) : null}
        </div>
  
        <div className="flex min-w-0 w-full items-center justify-between gap-spacing-2 sm:w-auto sm:shrink-0 sm:justify-end sm:gap-spacing-3">
          {projectId ? <WorkspaceHistoryButton projectId={projectId} /> : null}
          {projectId ? <EnergyLedgerButton projectId={projectId} /> : null}
          {runtime ? <RuntimeControl runtime={runtime} /> : null}
  
          {activeTab === "preview" ? (
            <div
              role="tablist"
              aria-label="Tampilan viewport"
              className="flex h-9 items-center rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-0.5 text-xs"
            >
              <TabButton
                active={viewport === "desktop"}
                id="viewport-desktop-tab"
                controls="viewport-desktop"
                onClick={() => setViewport("desktop")}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight") {
                    event.preventDefault();
                    setViewport("mobile");
                    (event.currentTarget.nextElementSibling as HTMLElement)?.focus();
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
                controls="viewport-mobile"
                onClick={() => setViewport("mobile")}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    setViewport("desktop");
                    (event.currentTarget.previousElementSibling as HTMLElement)?.focus();
                  }
                }}
                icon={<Smartphone className="size-4" />}
                layoutId="workspace-viewport-tab"
              >
                HP
              </TabButton>
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: Update `RuntimeControl` button heights to h-9**
  Modify: `src/components/projects/WorkspacePrimitives.tsx` around line 230:
  ```tsx
  function RuntimeControl({ runtime }: { runtime: WorkspaceRuntimeControl }) {
    return (
      <div className="flex min-w-0 items-center gap-spacing-1 sm:gap-spacing-2">
        {runtime.publishedPath ? (
          <a
            href={runtime.publishedPath}
            target="_blank"
            rel="noreferrer"
            aria-label="Buka website yang diterbitkan"
            className="inline-flex h-9 items-center justify-center gap-spacing-2 rounded-radius-md border border-surface-warm-white/10 px-spacing-3 text-xs text-surface-warm-white/70 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
          >
            <ExternalLink className="size-4" />
            <span className="hidden sm:inline">Buka</span>
          </a>
        ) : (
          <button
            type="button"
            disabled={!runtime.canPublish || runtime.isPublishing}
            onClick={runtime.onPublish}
            aria-label={
              runtime.isPublishing
                ? "Sedang menerbitkan website..."
                : "Terbitkan website ke domain publik"
            }
            className="inline-flex h-9 items-center justify-center gap-spacing-2 rounded-radius-md border border-surface-warm-white/10 px-spacing-3 text-xs text-surface-warm-white/70 transition hover:bg-surface-warm-white/8 hover:text-surface-warm-white disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
          >
            {runtime.isPublishing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Globe2 className="size-4" />
            )}
            <span className="hidden sm:inline">
              {runtime.isPublishing ? "Menerbitkan..." : "Terbitkan"}
            </span>
          </button>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 4: Run tests to verify no syntax errors or breaking changes**
  Run: `bun run check`
  Expected: Passed format, lint, typecheck.

- [ ] **Step 5: Commit changes**
  Run:
  ```bash
  git add src/components/projects/WorkspacePrimitives.tsx
  git commit -m "style(workspace): standardize top bar buttons and segmented tabs to h-9"
  ```

---

### Task 3: Standardize Chat Prompt Toggle Tab and Render Attachments
*Align "Pilihan" vs "Tulis bebas" toggle button heights, container padding, and styles to the header ones, and add attachments handling to the fallback default chat composer.*

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx`

**Interfaces:**
- Consumes: `pendingAttachments`, `setPendingAttachments`, `removeAttachment` from `WorkspaceShell`.
- Produces: None

- [ ] **Step 1: Standardize prompt composer toggle button height and styles**
  Modify: `src/components/projects/WorkspaceShell.tsx` around line 2565.
  Change the wrapper and the map function to match the `TabButton` style and height (`h-9` container, `h-8` active state using `bg-surface-warm-white text-foreground-primary` with `motion.span` layoutId):
  ```tsx
                    <div className="mb-spacing-2 inline-flex h-9 items-center rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-0.5 text-xs w-fit">
                      {(
                        [
                          { label: "Pilihan", value: "options" },
                          { label: "Tulis bebas", value: "free" },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.value}
                          type="button"
                          onClick={() => {
                            setQuestionComposerMode(tab.value);
                            if (tab.value === "options") {
                              setMessage("");
                            }
                          }}
                          className="relative flex h-8 items-center justify-center gap-spacing-2 rounded-radius-sm px-spacing-4 text-xs font-medium transition focus-visible:outline-none cursor-pointer"
                        >
                          {questionComposerMode === tab.value && (
                            <motion.span
                              layoutId="question-composer-tab"
                              className="absolute inset-0 rounded-radius-sm bg-surface-warm-white"
                              transition={{
                                type: "spring",
                                stiffness: 500,
                                damping: 30,
                              }}
                            />
                          )}
                          <span
                            className={cn(
                              "relative z-10 flex items-center gap-spacing-2",
                              questionComposerMode === tab.value
                                ? "text-foreground-primary"
                                : "text-surface-warm-white/58 hover:text-surface-warm-white"
                            )}
                          >
                            {tab.label}
                          </span>
                        </button>
                      ))}
                    </div>
  ```

- [ ] **Step 2: Add attachments wrapper to the default chat composer form**
  Modify: `src/components/projects/WorkspaceShell.tsx` around line 2786.
  Locate `<form onSubmit={handleMessageSubmit} className="mt-spacing-3 ...">`. Above the `<textarea>`, render `ComposerAttachments` conditionally:
  ```tsx
                    <form
                      onSubmit={handleMessageSubmit}
                      className="mt-spacing-3 min-w-0 rounded-[28px] border border-surface-warm-white/12 bg-[#262622] p-spacing-4 shadow-[0_18px_48px_rgba(0,0,0,0.22)]"
                    >
                      <label htmlFor="workspace-message" className="sr-only">
                        Pesan untuk AI
                      </label>
                      {pendingAttachments.length > 0 ? (
                        <ComposerAttachments
                          attachments={pendingAttachments}
                          onRemove={(id) =>
                            setPendingAttachments((cur) =>
                              removeAttachment(cur, id),
                            )
                          }
                        />
                      ) : null}
                      <textarea
                        id="workspace-message"
                        ...
  ```

- [ ] **Step 3: Add `ComposerAttachButton` inside the default chat composer form**
  Modify: `src/components/projects/WorkspaceShell.tsx` around line 2811.
  Add `ComposerAttachButton` next to the submit `<Button>`:
  ```tsx
                      <div className="flex items-center justify-end gap-spacing-4">
                        <div className="flex items-center gap-spacing-2">
                          <ComposerAttachButton
                            attachments={pendingAttachments}
                            onAdd={(next, rejected) => {
                              setPendingAttachments(next);
                              if (rejected.length) {
                                toast.error(
                                  `Maksimal ${MAX_COMPOSER_IMAGES} gambar per pesan.`,
                                );
                              }
                            }}
                          />
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
                      </div>
                    </form>
  ```

- [ ] **Step 4: Run typecheck and lint to verify imports and layout**
  Run: `bun run check`
  Expected: All green.

- [ ] **Step 5: Commit changes**
  Run:
  ```bash
  git add src/components/projects/WorkspaceShell.tsx
  git commit -m "style(workspace): standardize prompt toggle and add attachments button to default chat composer"
  ```

---

### Task 4: Simplified Build Loader & Closed Folders Tree Default
*Simplify the build progress preview to a spinner, and default directories in Code explorer to collapse unless they contain the active file.*

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx`

**Interfaces:**
- Consumes: None
- Produces: None

- [ ] **Step 1: Simplify preview pane loading panel**
  Modify: `src/components/projects/WorkspaceShell.tsx` around line 2883.
  Replace `isBuilding` condition in the preview panel with a simple spinner:
  ```tsx
	                    {activeTab === "preview" ? (
	                      <div
	                        id="workspace-preview-panel"
	                        role="tabpanel"
	                        aria-labelledby="workspace-preview-tab"
	                        className="h-full min-h-0"
	                      >
	                        {isBuilding ? (
	                          <div className="grid min-h-full place-items-center bg-[#10100f] p-spacing-10 text-center">
	                            <div className="flex flex-col items-center gap-spacing-4 text-center">
	                              <div className="size-9 animate-spin rounded-full border-2 border-surface-warm-white/12 border-t-surface-warm-white/82" />
	                              <p className="text-sm font-medium text-surface-warm-white/78">
	                                Menyiapkan pratinjau website...
	                              </p>
	                            </div>
	                          </div>
	                        ) : previewIssue ? (
  ```

- [ ] **Step 2: Change FileTreeItem to collapse folders by default**
  Modify: `src/components/projects/WorkspaceShell.tsx` around line 3458.
  Update `<details open ...>` to collapse by default unless it's a parent of the active selected file:
  ```tsx
  function FileTreeItem({
    name,
    node,
    onSelect,
    selectedPath,
  }: {
    name: string;
    node: FileTreeNode;
    onSelect: (path: string) => void;
    selectedPath: string;
  }) {
    if (node.type === "file") {
      const selected = node.path === selectedPath;
  
      return (
        <button
          type="button"
          onClick={() => onSelect(node.path)}
          className={`block w-full truncate px-spacing-4 py-spacing-1.5 text-left text-sm transition ${selected ? "bg-surface-warm-white/12 text-surface-warm-white" : "text-surface-warm-white/62 hover:bg-surface-warm-white/7 hover:text-surface-warm-white"}`}
          title={node.path}
        >
          <span className="pl-spacing-6">{name}</span>
        </button>
      );
    }
  
    const isParent = selectedPath.startsWith(node.path + "/");
  
    return (
      <details key={node.path + "-" + isParent} defaultOpen={isParent} className="group">
        <summary className="cursor-pointer list-none px-spacing-4 py-spacing-1.5 text-sm font-medium text-surface-warm-white/72 hover:bg-surface-warm-white/7 hover:text-surface-warm-white [&::-webkit-details-marker]:hidden">
  ```

- [ ] **Step 3: Run check to verify styling is correct**
  Run: `bun run check`
  Expected: Passed format, lint, typecheck, tests.

- [ ] **Step 4: Commit changes**
  Run:
  ```bash
  git add src/components/projects/WorkspaceShell.tsx
  git commit -m "style(workspace): simplify build loader and collapse code directories by default"
  ```

---

### Task 5: Floating "Lompat ke Bawah" Chat Auto-Scroll Button
*Implement a button to easily snap back to the bottom when the user scrolls up.*

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx`

**Interfaces:**
- Consumes: `chatScrollRef`, `shouldStickToBottomRef`, `scrollChatToBottom` in `WorkspaceShell`.
- Produces: None

- [ ] **Step 1: Add ArrowDown icon to import list**
  Modify: `src/components/projects/WorkspaceShell.tsx` near top.
  Add `ArrowDown` to the `lucide-react` import statement (usually from `@tanstack/react-router` or `lucide-react` directly). Let's see: `import { PanelLeftOpen, PanelLeftClose, ... } from "lucide-react"`.
  Check if `ArrowDown` is already imported or not; if not, add it.

- [ ] **Step 2: Add `showScrollToBottom` state to the workspace component**
  Modify: `src/components/projects/WorkspaceShell.tsx` around line 212.
  Add:
  ```typescript
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  ```

- [ ] **Step 3: Update `onScroll` handler on the chat scroll container to set `showScrollToBottom`**
  Modify: `src/components/projects/WorkspaceShell.tsx` around line 2424:
  ```tsx
              onScroll={(event) => {
                if (ignoreNextScrollRef.current) {
                  return;
                }

                const element = event.currentTarget;
                const nearBottom = isChatNearBottom(element);
                shouldStickToBottomRef.current = nearBottom;
                setShowScrollToBottom(!nearBottom);
              }}
  ```

- [ ] **Step 4: Wrap the scroll viewport in a relative parent container and render the button**
  Modify: `src/components/projects/WorkspaceShell.tsx` around line 2409.
  Wrap the scroll container:
  ```tsx
            <div className="relative flex min-h-0 flex-1 flex-col mt-spacing-5">
              <div
                ref={chatScrollRef}
                onWheel={(event) => {
                  // Immediate unstick when user scrolls up, even mid smooth-follow.
                  if (event.deltaY < 0) {
                    shouldStickToBottomRef.current = false;
                  }
                }}
                onTouchStart={() => {
                  // Touch drag intent: stop forcing until they return to bottom.
                  const element = chatScrollRef.current;
                  if (element && !isChatNearBottom(element)) {
                    shouldStickToBottomRef.current = false;
                  }
                }}
                onScroll={(event) => {
                  if (ignoreNextScrollRef.current) {
                    return;
                  }

                  const element = event.currentTarget;
                  const nearBottom = isChatNearBottom(element);
                  shouldStickToBottomRef.current = nearBottom;
                  setShowScrollToBottom(!nearBottom);
                }}
                className="min-h-0 flex-1 space-y-spacing-6 overflow-y-auto overflow-x-hidden px-spacing-1 pr-spacing-2 [scrollbar-color:#6f6a60_transparent] [scrollbar-width:thin]"
              >
                {hasMoreChat ? (
                  <div
                    ref={olderChatSentinelRef}
                    className="py-spacing-3 text-center"
                  >
                    {isLoadingOlderChat ? (
                      <span className="text-xs text-surface-warm-white/50">
                        Memuat chat lama...
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <ChatMessages messages={visibleMessages} />

                {isBuilding || buildProgress.length ? (
                  <BuildProgressPanel
                    elapsedFrom={buildStartedAt}
                    isBuilding={isBuilding}
                    steps={buildProgress}
                  />
                ) : null}

                {isResponding ? (
                  <p className="text-sm text-surface-warm-white/46">
                    AI sedang menyiapkan jawaban...
                  </p>
                ) : null}
                {rateLimitError ? (
                  <div className="rounded-[18px] border border-[#ffb4a6]/24 bg-[#ffb4a6]/[0.06] px-spacing-5 py-spacing-4">
                    <p className="text-sm font-medium text-[#ffb4a6]">
                      {rateLimitError.message}
                    </p>
                  </div>
                ) : sessionExpired ? (
                  <div className="rounded-[18px] border border-[#ffb4a6]/24 bg-[#ffb4a6]/[0.06] px-spacing-5 py-spacing-4">
                    <p className="text-sm font-medium text-[#ffb4a6]">
                      Sesi kamu sudah habis.
                    </p>
                    <Button
                      type="button"
                      onClick={() => void signOut({ callbackUrl: "/" })}
                      className="mt-spacing-3 h-9 rounded-full bg-surface-warm-white px-spacing-5 text-xs text-foreground-primary hover:bg-surface-warm-white/86"
                    >
                      Login ulang
                    </Button>
                  </div>
                ) : isPreparingNextQuestion ? (
                  <p className="text-sm text-surface-warm-white/46">
                    Menyiapkan pertanyaan berikutnya...
                  </p>
                ) : workspaceCardError ? (
                  <div className="rounded-[18px] border border-[#ffb4a6]/24 bg-[#ffb4a6]/[0.06] px-spacing-5 py-spacing-4">
                    <p className="text-sm font-medium text-[#ffb4a6]">
                      {isRetrying
                        ? "Mencoba menyiapkan pertanyaan lagi..."
                        : "Pertanyaan berikutnya belum berhasil dibuat."}
                    </p>
                    {!isRetrying ? (
                      <Button
                        type="button"
                        onClick={() => void retryWorkspaceCard()}
                        className="mt-spacing-3 h-9 rounded-full bg-surface-warm-white px-spacing-5 text-xs text-foreground-primary hover:bg-surface-warm-white/86"
                      >
                        Coba lagi
                      </Button>
                    ) : null}
                  </div>
                ) : error ? (
                  <div className="rounded-[18px] border border-[#ffb4a6]/24 bg-[#ffb4a6]/[0.06] px-spacing-5 py-spacing-4">
                    <p className="text-sm font-medium text-[#ffb4a6]">
                      {isRetrying
                        ? "AI sempat terputus. Mencoba menyambung ulang..."
                        : "AI sempat terputus. Coba kirim ulang pesanmu."}
                    </p>
                    {!isRetrying ? (
                      <Button
                        type="button"
                        onClick={() => void retryChat()}
                        className="mt-spacing-3 h-9 rounded-full bg-surface-warm-white px-spacing-5 text-xs text-foreground-primary hover:bg-surface-warm-white/86"
                      >
                        Kirim ulang
                      </Button>
                    ) : null}
                  </div>
                ) : resumeError ? (
                  <div className="rounded-[18px] border border-[#ffb4a6]/24 bg-[#ffb4a6]/[0.06] px-spacing-5 py-spacing-4">
                    <p className="text-sm font-medium text-[#ffb4a6]">
                      {resumeError.message}
                    </p>
                    {!isRetrying ? (
                      <Button
                        type="button"
                        onClick={() => void retryChat()}
                        className="mt-spacing-3 h-9 rounded-full bg-surface-warm-white px-spacing-5 text-xs text-foreground-primary hover:bg-surface-warm-white/86"
                      >
                        {resumeError.retryText}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {showScrollToBottom && (
                <button
                  type="button"
                  onClick={() => {
                    shouldStickToBottomRef.current = true;
                    scrollChatToBottom({ force: true, behavior: "smooth" });
                    setShowScrollToBottom(false);
                  }}
                  className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 flex items-center gap-2 rounded-full border border-surface-warm-white/10 bg-surface-warm-white px-4 py-2 text-xs font-semibold text-foreground-primary shadow-lg hover:bg-surface-warm-white/90 active:scale-95 transition-all cursor-pointer"
                >
                  <ArrowDown className="size-3.5" />
                  <span>Lompat ke Bawah</span>
                </button>
              )}
            </div>
  ```

- [ ] **Step 5: Run quality checks and tests**
  Run: `bun run check`
  Expected: Passed format, lint, typecheck, tests.

- [ ] **Step 6: Commit changes**
  Run:
  ```bash
  git add src/components/projects/WorkspaceShell.tsx
  git commit -m "feat(workspace): add float scroll to bottom button to chat view"
  ```

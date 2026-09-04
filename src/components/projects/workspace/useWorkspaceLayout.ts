"use client";

import { useCallback, useRef, useState } from "react";

import type { BuildTab } from "@/components/projects/workspace/WorkspacePrimitives";
import type { PanelImperativeHandle } from "react-resizable-panels";

import { useIsDesktopViewport } from "@/lib/use-is-desktop-viewport";

export function useWorkspaceLayout({
  activeTab,
  hasInitialPreview,
}: {
  activeTab: BuildTab;
  hasInitialPreview: boolean;
}) {
  const isDesktop = useIsDesktopViewport();
  const [mobileSurface, setMobileSurface] = useState<"chat" | "preview">(
    hasInitialPreview ? "preview" : "chat",
  );
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(!hasInitialPreview);

  const chatPanelRef = useRef<PanelImperativeHandle | null>(null);
  const previewPanelRef = useRef<PanelImperativeHandle | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const openPreviewPanel = useCallback(() => {
    setMobileSurface("preview");
    setPreviewCollapsed(false);
    window.requestAnimationFrame(() => {
      chatPanelRef.current?.resize("25%");
      previewPanelRef.current?.resize("75%");
    });
  }, []);

  const openChatPanel = useCallback(() => {
    setMobileSurface("chat");
    setChatCollapsed(false);
    setPreviewCollapsed(false);
    window.requestAnimationFrame(() => {
      chatPanelRef.current?.resize("25%");
      previewPanelRef.current?.resize("75%");
    });
  }, []);

  const closeChatPanel = useCallback(() => {
    setChatCollapsed(true);
    window.requestAnimationFrame(() => {
      chatPanelRef.current?.collapse();
      previewPanelRef.current?.resize("100%");
    });
  }, []);

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    const touch = event.touches[0];
    if (touch) {
      swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
    }
  }, []);

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      if (!start) {
        return;
      }
      if (mobileSurface === "preview" && activeTab === "code") {
        return;
      }
      const touch = event.changedTouches[0];
      if (!touch) {
        return;
      }
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) < 60 || Math.abs(dy) > 40) {
        return;
      }
      if (dx < 0 && mobileSurface === "chat") {
        openPreviewPanel();
      } else if (dx > 0 && mobileSurface === "preview") {
        openChatPanel();
      }
    },
    [activeTab, mobileSurface, openChatPanel, openPreviewPanel],
  );

  return {
    chatCollapsed,
    chatPanelRef,
    closeChatPanel,
    handleTouchEnd,
    handleTouchStart,
    isDesktop,
    mobileSurface,
    openChatPanel,
    openPreviewPanel,
    previewCollapsed,
    previewPanelRef,
    setChatCollapsed,
    setMobileSurface,
    setPreviewCollapsed,
  };
}

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import type { RuntimeWorkspaceState } from "./workspace-helpers";
import type {
  BuildProgressStep,
  BuildTab,
} from "@/components/projects/workspace/WorkspacePrimitives";
import type { GeneratedProjectFile } from "@/lib/projects/generated-types";

import {
  useBuildAttemptStream,
  type BuildStreamEvent,
} from "@/components/projects/build/useBuildAttemptStream";
import { track } from "@/lib/analytics";
import {
  completeBuildProgressSteps,
  mergeHydratedBuildProgress,
} from "@/lib/projects/build-progress-steps";
import {
  completeBuildStreamProgress,
  createBuildStreamDeduper,
  reduceBuildStreamEvent,
} from "@/lib/projects/build-stream-event";
import { getProjectRuntimePollInterval } from "@/lib/projects/workspace-sync";
import { fetchJson, queryKeys } from "@/lib/query-client";

export type UseWorkspaceBuildOptions = {
  activeTab: BuildTab;
  initialStatus: string;
  onBuildError?: () => void;
  onBuildStarted?: () => void;
  onBuildSuccess?: () => void;
  onEnergyInvalidate?: () => void;
  onSetChatCollapsed?: (collapsed: boolean) => void;
  onSetMobileSurface?: (surface: "chat" | "preview") => void;
  onSetMode?: (mode: "build" | "discuss") => void;
  onSetPostBuildChatOpen?: (open: boolean) => void;
  projectId: string;
  readOnly?: boolean;
};

export function useWorkspaceBuild({
  activeTab,
  initialStatus,
  onBuildError,
  onBuildSuccess,
  onEnergyInvalidate,
  onSetChatCollapsed,
  onSetMobileSurface,
  onSetMode,
  onSetPostBuildChatOpen,
  projectId,
  readOnly = false,
}: UseWorkspaceBuildOptions) {
  const queryClient = useQueryClient();

  const patchProjectInList = useCallback(
    (patch: Partial<{ buildStatus: string }>) => {
      queryClient.setQueryData(queryKeys.projects, (old: unknown) => {
        const data = old as
          | {
              pages: Array<{
                projects: Array<{ id: string; buildStatus?: string }>;
              }>;
            }
          | undefined;
        if (!data) {
          return data;
        }
        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            projects: page.projects.map((p) =>
              p.id === projectId ? { ...p, ...patch } : p,
            ),
          })),
        };
      });
    },
    [projectId, queryClient],
  );

  const [buildStatus, setBuildStatus] = useState(initialStatus);
  const buildStatusRef = useRef(buildStatus);
  buildStatusRef.current = buildStatus;

  const [buildProgress, setBuildProgress] = useState<BuildProgressStep[]>([]);
  const buildStreamDeduperRef = useRef(createBuildStreamDeduper());
  const [buildStartedAt, setBuildStartedAt] = useState<number | null>(null);

  const [runtimeState, setRuntimeState] =
    useState<RuntimeWorkspaceState | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const runtimeRetryAfterRef = useRef(0);

  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedPath, setPublishedPath] = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);

  const [previewReloadKey, setPreviewReloadKey] = useState(0);

  // Source files for code view
  const [sourceFiles, setSourceFiles] = useState<GeneratedProjectFile[]>([]);
  const [sourceStatus, setSourceStatus] = useState("not_started");
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [sourceReloadKey, setSourceReloadKey] = useState(0);

  const reloadPreview = useCallback(() => {
    setPreviewReloadKey((cur) => cur + 1);
  }, []);

  const reloadSource = useCallback(() => {
    setSourceReloadKey((cur) => cur + 1);
  }, []);

  const loadRuntimeState = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.projectRuntime(projectId),
    });
  }, [projectId, queryClient]);

  const runtimeQuery = useQuery({
    queryKey: queryKeys.projectRuntime(projectId),
    queryFn: async () => {
      if (Date.now() < runtimeRetryAfterRef.current) {
        throw new Error("runtime_backoff");
      }

      const response = await fetch(`/api/projects/${projectId}/runtime`, {
        cache: "no-store",
      });

      if (response.status === 503) {
        const retryAfter = Number(response.headers.get("Retry-After") || "3");
        runtimeRetryAfterRef.current = Date.now() + retryAfter * 1000;
        throw new Error("runtime_unavailable");
      }

      if (!response.ok) {
        throw new Error("runtime_failed");
      }

      return (await response.json()) as RuntimeWorkspaceState;
    },
    refetchInterval: (query) =>
      getProjectRuntimePollInterval(
        query.state.data as RuntimeWorkspaceState | undefined,
      ),
    placeholderData: (previous) => previous,
    staleTime: 3000,
    retry: 1,
  });

  useEffect(() => {
    if (!runtimeQuery.data) {
      return;
    }

    const result = runtimeQuery.data;
    setRuntimeState(result);
    setRuntimeError(null);

    if (result.latestSuccessfulBuild) {
      setSourceStatus("passed");
    }

    if (result.publishedDeployment?.publicPath) {
      setPublishedPath(result.publishedDeployment.publicPath);
    }

    const job = result.activeJob;
    const jobRunning =
      job && ["generating", "building", "finalizing"].includes(job.phase || "");
    const attemptRunning = ["queued", "running"].includes(
      result.latestAttempt?.status || "",
    );
    const serverBuilding =
      jobRunning || attemptRunning || result.userFacingState === "building";

    if (serverBuilding) {
      setBuildStatus("building");
      onSetMode?.("build");
      const startedMs = Date.parse(
        job?.startedAt || result.latestAttempt?.startedAt || "",
      );
      if (Number.isFinite(startedMs)) {
        setBuildStartedAt((current) =>
          current && current <= startedMs ? current : startedMs,
        );
      } else {
        setBuildStartedAt((current) => current ?? Date.now());
      }
      if (job?.steps?.length) {
        const hydrated = job.steps.map((step) => ({
          detail: step.detail,
          diff: step.diff,
          durationMs: step.durationMs,
          label: step.label,
          startedAt: step.startedAt,
          status: step.status,
        }));
        setBuildProgress((current) =>
          mergeHydratedBuildProgress(current, hydrated),
        );
      } else {
        setBuildProgress((current) =>
          current.length
            ? current
            : [
                {
                  detail:
                    job?.message || result.message || "Website sedang dibuat.",
                  label:
                    job?.kind === "edit"
                      ? "Merevisi website"
                      : "Memeriksa website",
                  status: "active" as const,
                },
              ],
        );
      }
      return;
    }

    if (
      result.userFacingState === "ready" ||
      result.userFacingState === "ready_with_failed_latest_attempt"
    ) {
      if (buildStatusRef.current === "building") {
        setBuildStatus("ready");
        setBuildProgress((current) => completeBuildProgressSteps(current));
        setPreviewReloadKey((current) => current + 1);
        onBuildSuccess?.();
      }
    } else if (result.userFacingState === "build_failed_without_last_good") {
      if (buildStatusRef.current === "building") {
        setBuildStatus("failed");
        onBuildError?.();
      }
    }
  }, [onBuildError, onBuildSuccess, onSetMode, runtimeQuery.data]);

  const handleBuildStreamEvent = useCallback(
    (event: BuildStreamEvent) => {
      if (!buildStreamDeduperRef.current(event)) {
        return;
      }
      const result = reduceBuildStreamEvent(event);

      if (result.kind === "progress") {
        setBuildProgress(result.update);
        return;
      }

      if (result.kind === "energy") {
        window.dispatchEvent(new Event("umkm:energy-changed"));
        onEnergyInvalidate?.();
        return;
      }

      if (result.kind === "done") {
        setBuildStatus("ready");
        onSetPostBuildChatOpen?.(true);
        onSetMode?.("discuss");
        onSetMobileSurface?.("chat");
        setBuildProgress((current) => completeBuildStreamProgress(current));
        patchProjectInList({ buildStatus: "ready" });
        void loadRuntimeState();
        setSourceReloadKey((current) => current + 1);
        setPreviewReloadKey((current) => current + 1);
        window.dispatchEvent(new Event("umkm:energy-changed"));
        void queryClient.invalidateQueries({
          queryKey: queryKeys.projects,
          refetchType: "active",
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.energy });
        onBuildSuccess?.();
        return;
      }

      if (result.kind === "error") {
        setBuildStatus("failed");
        onSetMode?.("discuss");
        onSetMobileSurface?.("chat");
        onSetChatCollapsed?.(false);
        void loadRuntimeState();
        setSourceReloadKey((current) => current + 1);
        setBuildProgress(result.update);
        onBuildError?.();
      }
    },
    [
      loadRuntimeState,
      onBuildError,
      onBuildSuccess,
      onEnergyInvalidate,
      onSetChatCollapsed,
      onSetMobileSurface,
      onSetMode,
      onSetPostBuildChatOpen,
      patchProjectInList,
      queryClient,
    ],
  );

  const activeAttemptId =
    runtimeState?.activeJob?.attemptId ||
    (["queued", "running", "building"].includes(
      runtimeState?.latestAttempt?.status || "",
    )
      ? runtimeState?.latestAttempt?.id
      : null) ||
    null;

  useBuildAttemptStream({
    attemptId: activeAttemptId,
    onEvent: handleBuildStreamEvent,
    projectId,
  });

  const sourceQuery = useQuery({
    queryKey: [
      ...queryKeys.projectSource(projectId),
      sourceReloadKey,
      buildStatus,
    ],
    queryFn: async () =>
      fetchJson<{
        buildStatus?: string;
        files?: GeneratedProjectFile[];
      }>(`/api/projects/${projectId}/source`),
    enabled: activeTab === "code",
  });

  useEffect(() => {
    if (activeTab !== "code") {
      return;
    }

    setIsLoadingSource(sourceQuery.isPending || sourceQuery.isFetching);
    setSourceError(
      sourceQuery.isError
        ? "Kode website belum bisa dimuat. Coba lagi tanpa kehilangan tampilan terakhir."
        : null,
    );

    if (sourceQuery.data) {
      setSourceFiles(sourceQuery.data.files ?? []);
      setSourceStatus(sourceQuery.data.buildStatus ?? "not_started");
    }
  }, [
    activeTab,
    sourceQuery.data,
    sourceQuery.isError,
    sourceQuery.isFetching,
    sourceQuery.isPending,
  ]);

  const publishProject = useCallback(async () => {
    if (readOnly || isPublishing) {
      return;
    }

    track("publish_project", { projectId });
    setIsPublishing(true);
    setRuntimeError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/publish`, {
        method: "POST",
      });
      const result = (await response.json().catch(() => null)) as {
        message?: string;
        path?: string;
      } | null;

      if (!response.ok || !result?.path) {
        setRuntimeError(result?.message || "Website belum bisa diterbitkan.");
        return;
      }

      setPublishedPath(result.path);
      await loadRuntimeState();
    } catch {
      setRuntimeError("Website belum bisa diterbitkan.");
    } finally {
      setIsPublishing(false);
    }
  }, [isPublishing, loadRuntimeState, projectId, readOnly]);

  const cancelBuild = useCallback(async () => {
    if (readOnly || isCanceling) {
      return;
    }

    setIsCanceling(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/cancel`, {
        method: "POST",
      });

      if (!response.ok) {
        setRuntimeError("Website belum bisa dihentikan.");
        return;
      }

      await loadRuntimeState();
    } catch {
      setRuntimeError("Website belum bisa dihentikan.");
    } finally {
      setIsCanceling(false);
    }
  }, [isCanceling, loadRuntimeState, projectId, readOnly]);

  const recoverPreviewRuntime = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/restart`, {
        method: "POST",
      });
      if (!response.ok) {
        setRuntimeError("Tampilan website belum bisa dimuat ulang.");
      }
    } catch {
      setRuntimeError("Tampilan website belum bisa dimuat ulang.");
    }
    setPreviewReloadKey((current) => current + 1);
    void loadRuntimeState();
  }, [loadRuntimeState, projectId]);

  const resetProgressDeduper = useCallback(() => {
    buildStreamDeduperRef.current = createBuildStreamDeduper();
  }, []);

  return {
    buildProgress,
    buildStartedAt,
    buildStatus,
    cancelBuild,
    handleBuildStreamEvent,
    isCanceling,
    isLoadingSource,
    isPublishing,
    loadRuntimeState,
    previewReloadKey,
    publishProject,
    publishedPath,
    recoverPreviewRuntime,
    reloadPreview,
    reloadSource,
    resetProgressDeduper,
    runtimeError,
    runtimeState,
    setBuildProgress,
    setBuildStartedAt,
    setBuildStatus,
    setPublishedPath,
    setRuntimeError,
    setSourceError,
    setSourceFiles,
    setSourceStatus,
    sourceError,
    sourceFiles,
    sourceReloadKey,
    sourceStatus,
  };
}

import type {
  BuildProgressStep,
  WorkspaceRuntimeControl,
} from "@/components/projects/workspace/WorkspacePrimitives";
import type { ProjectBrief, WorkspaceCard } from "@/lib/projects/brief";
import type { UIMessage } from "ai";

import { chatBubbleClass } from "@/components/projects/chat/ChatMessage";
import { getTextFromUIMessage } from "@/lib/projects/chat-memory";
import { getWorkspaceReleaseState } from "@/lib/projects/workspace-release";
import { isUserVisibleAssistantText } from "@/lib/projects/workspace-sync";

// Must match the server limit in api.projects.preview.ts
export const MAX_CHAT_BYTES = 16 * 1024;

export { chatBubbleClass };

export const COMPOSER_TRANSITION = {
  initial: { opacity: 0, y: 12, scale: 0.985, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, y: -10, scale: 0.985, filter: "blur(6px)" },
  transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
};

export type RuntimeWorkspaceState = {
  activeJob?: {
    attemptId?: string | null;
    buildId?: string | null;
    kind?: string;
    message?: string | null;
    phase?: string;
    startedAt?: string;
    steps?: Array<{
      detail: string;
      diff?: BuildProgressStep["diff"];
      durationMs?: number;
      label: string;
      startedAt?: number;
      status?: "active" | "done" | "error";
    }>;
    updatedAt?: string;
  } | null;
  activePreviewDeployment?: {
    build?: {
      id: string;
      status: string;
    } | null;
    buildId?: string | null;
    id: string;
    lastRequestAt?: string | null;
    publicPath?: string | null;
    snapshotId?: string | null;
    status: string;
  } | null;
  build: {
    artifactRef?: string | null;
    finishedAt?: string | null;
    id: string;
    logText?: string | null;
    startedAt?: string | null;
    status: string;
  } | null;
  deployment: {
    build?: {
      id: string;
      status: string;
    } | null;
    buildId?: string | null;
    id: string;
    lastRequestAt?: string | null;
    publicPath?: string | null;
    snapshotId?: string | null;
    status: string;
  } | null;
  events: Array<{
    id: string;
    message?: string | null;
    type: string;
  }>;
  publishedDeployment: {
    build?: {
      id: string;
      status: string;
    } | null;
    buildId?: string | null;
    id: string;
    publicPath: string | null;
    publicState?: "live" | "not_live";
    snapshotId?: string | null;
    slug: string | null;
    status: string;
  } | null;
  canPreview?: boolean;
  canPublish?: boolean;
  canRetry?: boolean;
  hasPersistedSource?: boolean;
  latestAttempt?: {
    id: string;
    startedAt?: string | null;
    status: string;
  } | null;
  latestFailedAttempt?: {
    id: string;
    status: string;
  } | null;
  latestSuccessfulBuild?: {
    id: string;
    status: string;
  } | null;
  message?: string | null;
  userFacingState?: string | null;
};

export type WorkspaceStateResponse = {
  brief?: ProjectBrief;
  projectId: string;
  projectTitle: string;
  workspaceCard: WorkspaceCard;
};

export type ChatError = Error & {
  code?: string;
  retryAfter?: number;
  status?: number;
};

export function buildWorkspaceRuntimeControl({
  buildStatus,
  isPublishing,
  onPublish,
  onReload,
  publishedPath,
  runtimeState,
  sourceStatus,
}: {
  buildStatus: string;
  isPublishing: boolean;
  onPublish: () => void;
  onReload?: () => void;
  publishedPath: string | null;
  runtimeState: RuntimeWorkspaceState | null;
  sourceStatus: string;
}): WorkspaceRuntimeControl {
  const runtimeBuildStatus =
    runtimeState?.activePreviewDeployment?.build?.status ||
    runtimeState?.deployment?.build?.status ||
    runtimeState?.build?.status ||
    (sourceStatus === "passed"
      ? "succeeded"
      : buildStatus === "building"
        ? "running"
        : buildStatus === "ready"
          ? "succeeded"
          : buildStatus);
  const runtimePublishedPath =
    publishedPath || runtimeState?.publishedDeployment?.publicPath || null;
  const release = getWorkspaceReleaseState({
    ownerBlocked: runtimeState?.publishedDeployment?.publicState === "not_live",
    previewBuildId:
      runtimeState?.activePreviewDeployment?.buildId ??
      runtimeState?.activePreviewDeployment?.build?.id ??
      runtimeState?.deployment?.buildId ??
      runtimeState?.deployment?.build?.id,
    previewBuildStatus: runtimeBuildStatus,
    publishedBuildId:
      runtimeState?.publishedDeployment?.buildId ??
      runtimeState?.publishedDeployment?.build?.id,
    publishedPath: runtimePublishedPath,
    publishedStatus: runtimeState?.publishedDeployment?.status,
  });

  return {
    ...release,
    activeSnapshotId: runtimeState?.activePreviewDeployment?.snapshotId ?? null,
    isPublishing,
    onPublish,
    onReload,
    publishedPath: runtimePublishedPath,
  };
}

export function filterDiscussionMessagesWithWorkspaceUi(
  messages: UIMessage[],
  enabled: boolean,
): UIMessage[] {
  if (!enabled) {
    return messages;
  }

  return messages.filter((message) => {
    if (message.role !== "assistant") {
      return true;
    }

    return message.parts.some((part) => {
      if (part.type === "text") {
        return isUserVisibleAssistantText(part.text);
      }

      return false;
    });
  });
}

export async function rateLimitAwareFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);

  if (response.status === 429) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      retryAfter?: number;
    } | null;
    const retryAfter =
      (body?.retryAfter ?? Number(response.headers.get("Retry-After"))) || 60;
    const error = new Error(
      body?.message ||
        `Terlalu banyak percobaan. Coba lagi dalam ${retryAfter} detik.`,
    ) as ChatError;

    error.status = 429;
    error.retryAfter = retryAfter;
    throw error;
  }

  if (response.status === 400) {
    const clone = response.clone();
    const body = (await clone.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    if (body?.code === "project_request_blocked") {
      const error = new Error(
        body.message || "Permintaan belum bisa diproses.",
      ) as ChatError;
      error.status = 400;
      error.code = "project_request_blocked";
      throw error;
    }
  }

  if (response.status === 409) {
    const clone = response.clone();
    const body = (await clone.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    if (body?.code === "project_chat_in_progress") {
      const error = new Error(
        body.message || "Obrolan masih berjalan untuk proyek ini.",
      ) as ChatError;
      error.status = 409;
      error.code = "project_chat_in_progress";
      throw error;
    }
  }

  if (response.status === 413) {
    const clone = response.clone();
    const body = (await clone.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    if (body?.code === "chat_turn_too_large") {
      const error = new Error(
        body.message || "Pesan terlalu panjang. Ringkas dulu sebelum dikirim.",
      ) as ChatError;
      error.status = 413;
      error.code = "chat_turn_too_large";
      throw error;
    }
  }

  return response;
}

export function readConsumedBuildRecommendationSignatures(
  projectId: string,
): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  const key = `umkmcepat:build-recommendation-consumed:${projectId}`;
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return new Set();
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(
      parsed.filter((value): value is string => typeof value === "string"),
    );
  } catch {
    return new Set();
  }
}

export function resolvePrimaryComposerIntent(input: {
  buildComplete: boolean;
  hasActionableRecommendation: boolean;
  hasDraft: boolean;
  hasPendingQuestion?: boolean;
}): "prepare_build" | "prepare_update" | null {
  if (
    input.hasDraft ||
    input.hasActionableRecommendation ||
    input.hasPendingQuestion
  ) {
    return null;
  }
  return input.buildComplete ? "prepare_update" : "prepare_build";
}

export const BUILD_CONFIRMATION_ONLY_RE =
  /^(?:ya|iya|yoi|oke|ok|yes|yep|gas|lanjut|boleh|setuju|silakan|silahkan)(?:[\s,]+(?:silakan|silahkan|buat|bikin|bangun|build|website|sekarang|aja|langsung|lanjut))*[.!?]*$/iu;

export function resolvePendingEditInstruction(
  current: string | null,
  next: string,
): string | null {
  const trimmed = next.trim();
  if (!trimmed || BUILD_CONFIRMATION_ONLY_RE.test(trimmed)) {
    return current;
  }
  return trimmed;
}

export function getLatestExplicitEditInstruction(
  messages: UIMessage[],
): string | null {
  return (
    [...messages]
      .reverse()
      .filter((message) => message.role === "user")
      .map(getTextFromUIMessage)
      .map((text) => text.trim())
      .find((text) => text && !BUILD_CONFIRMATION_ONLY_RE.test(text)) ?? null
  );
}

export function resolveBuildAction({
  buildComplete,
  buildStatus,
  hasPendingChatEdit,
  hasPostBuildUpdate,
}: {
  buildComplete: boolean;
  buildStatus: string;
  hasPendingChatEdit: boolean;
  hasPostBuildUpdate: boolean;
}): "edit" | "generate" {
  if (
    buildComplete &&
    buildStatus !== "failed" &&
    (hasPendingChatEdit || hasPostBuildUpdate)
  ) {
    return "edit";
  }
  return "generate";
}

export function resolveBuildRequestMode(
  buildStatus: string,
): "first_generate" | "retry_build" {
  return buildStatus === "failed" ? "retry_build" : "first_generate";
}

export function sanitizeWorkspaceCard(card: WorkspaceCard): WorkspaceCard {
  return card.type === "build_recommendation" && !canStartBuild(card)
    ? { type: "none" }
    : card;
}

export function canStartBuild(
  card: WorkspaceCard | null | undefined,
  _brief?: ProjectBrief | null | undefined,
): boolean {
  if (!card || card.type !== "build_recommendation") {
    return false;
  }
  const c = card as { handoffId?: string; reviewHash?: string };
  return Boolean(
    c.handoffId && c.reviewHash && /^[0-9a-f]{64}$/.test(c.reviewHash),
  );
}

// Legacy single-arg bridge for callers that pass only a brief.
export function canStartBuildFromBrief(
  brief: ProjectBrief | null | undefined,
): boolean {
  return Boolean(brief);
}

import type { WorkspaceMode } from "./workspace";

export const PROJECT_DRAFT_STORAGE_KEY = "umkmcepat:project-draft";

export type ProjectDraft = {
  continueAfterLogin: boolean;
  mode: WorkspaceMode;
  prompt: string;
  savedAt: number;
};

export function createProjectDraft(
  prompt: string,
  mode: WorkspaceMode,
  now = Date.now(),
  continueAfterLogin = false,
): ProjectDraft | null {
  const trimmedPrompt = prompt.trim();

  if (!trimmedPrompt) {
    return null;
  }

  return {
    prompt: trimmedPrompt,
    mode,
    savedAt: now,
    continueAfterLogin,
  };
}

export function parseProjectDraft(value: string | null): ProjectDraft | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const draft = parsed as Partial<ProjectDraft>;
    const prompt = typeof draft.prompt === "string" ? draft.prompt.trim() : "";
    const mode = draft.mode === "build" ? "build" : "discuss";
    const savedAt =
      typeof draft.savedAt === "number" && Number.isFinite(draft.savedAt)
        ? draft.savedAt
        : Date.now();
    const continueAfterLogin = draft.continueAfterLogin === true;

    if (!prompt) {
      return null;
    }

    return { prompt, mode, savedAt, continueAfterLogin };
  } catch {
    return null;
  }
}

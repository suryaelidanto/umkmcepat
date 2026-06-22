const NEW_PROJECT_PATH = "/projects/new";

export type WorkspaceMode = "discuss" | "build";

export function getNewProjectPath(
  prompt: string,
  mode: WorkspaceMode = "discuss",
) {
  const params = new URLSearchParams();
  const trimmedPrompt = prompt.trim();

  if (trimmedPrompt) {
    params.set("prompt", trimmedPrompt);
  }

  if (mode === "build") {
    params.set("mode", mode);
  }

  const query = params.toString();
  return query ? `${NEW_PROJECT_PATH}?${query}` : NEW_PROJECT_PATH;
}

export function getProjectTitle(prompt: string) {
  const normalized = prompt.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return "Proyek baru";
  }

  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

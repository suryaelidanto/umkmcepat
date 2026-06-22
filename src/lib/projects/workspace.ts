const NEW_PROJECT_PATH = "/projects/new";

export function getNewProjectPath(prompt: string, model?: string) {
  const params = new URLSearchParams();
  const trimmedPrompt = prompt.trim();
  const trimmedModel = model?.trim();

  if (trimmedPrompt) {
    params.set("prompt", trimmedPrompt);
  }

  if (trimmedModel) {
    params.set("model", trimmedModel);
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

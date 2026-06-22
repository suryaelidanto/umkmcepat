const DEMO_PROJECT_PATH = "/projects/demo";

export function getWorkspacePath(prompt: string, model?: string) {
  const trimmed = prompt.trim();
  const params = new URLSearchParams();

  if (trimmed) {
    params.set("prompt", trimmed);
  }

  if (model?.trim()) {
    params.set("model", model.trim());
  }

  const query = params.toString();
  return query ? `${DEMO_PROJECT_PATH}?${query}` : DEMO_PROJECT_PATH;
}

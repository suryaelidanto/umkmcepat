import { z } from "zod";

export const createProjectResponseSchema = z.object({
  assetIds: z.array(z.string()).default([]),
  id: z.string(),
  path: z.string(),
  projectCount: z.number().optional(),
  projectLimit: z.number().optional(),
});

export type CreateProjectResponse = z.infer<typeof createProjectResponseSchema>;

export type CreateProjectInput = {
  assetIds?: string[];
  idempotencyKey: string;
  mode?: "build" | "discuss";
  prompt: string;
};

export async function createProjectApi({
  assetIds = [],
  idempotencyKey,
  mode = "discuss",
  prompt,
}: CreateProjectInput): Promise<CreateProjectResponse> {
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("mode", mode);
  form.append("idempotencyKey", idempotencyKey);
  for (const assetId of assetIds) {
    if (assetId) {
      form.append("assetIds", assetId);
    }
  }

  const response = await fetch("/api/projects", {
    body: form,
    method: "POST",
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Gagal membuat website.");
  }

  const rawJson = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;

  if (!response.ok) {
    throw new Error(rawJson?.message || "Gagal membuat website.");
  }

  const parsed = createProjectResponseSchema.safeParse(rawJson);
  if (!parsed.success) {
    throw new Error("Respon server tidak valid.");
  }

  return parsed.data;
}

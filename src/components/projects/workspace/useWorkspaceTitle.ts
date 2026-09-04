"use client";

import { useCallback, useState } from "react";

import { queryKeys, useCacheMutation } from "@/lib/query-client";

export function useWorkspaceTitle({
  initialTitle,
  projectId,
  readOnly = false,
}: {
  initialTitle: string;
  projectId: string;
  readOnly?: boolean;
}) {
  const [projectTitle, setProjectTitle] = useState(initialTitle);
  const [draftTitle, setDraftTitle] = useState(initialTitle);
  const [isRenaming, setIsRenaming] = useState(false);
  const [mobileRenameOpen, setMobileRenameOpen] = useState(false);

  const saveTitleMutation = useCacheMutation<
    { title: string },
    { title: string }
  >({
    invalidateKeys: [queryKeys.projects],
    mutationFn: async ({ title }) => {
      const response = await fetch(`/api/projects/${projectId}/title`, {
        body: JSON.stringify({ title }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = (await response.json().catch(() => null)) as {
        title?: string;
      } | null;

      if (!response.ok || !result?.title) {
        throw new Error("Judul belum berhasil disimpan.");
      }

      return { title: result.title };
    },
    onSuccess: ({ title }) => {
      setProjectTitle(title);
      setDraftTitle(title);
    },
  });

  const saveProjectTitle = useCallback(async () => {
    if (readOnly) {
      setIsRenaming(false);
      setDraftTitle(projectTitle);
      return;
    }

    const title = draftTitle.trim();
    if (!title || title === projectTitle) {
      setIsRenaming(false);
      setDraftTitle(projectTitle);
      return;
    }

    setProjectTitle(title);
    setDraftTitle(title);

    try {
      await saveTitleMutation.mutateAsync({ title });
    } catch {
      setProjectTitle(projectTitle);
      setDraftTitle(projectTitle);
    } finally {
      setIsRenaming(false);
    }
  }, [draftTitle, projectTitle, readOnly, saveTitleMutation]);

  return {
    draftTitle,
    isRenaming,
    mobileRenameOpen,
    projectTitle,
    saveProjectTitle,
    setDraftTitle,
    setIsRenaming,
    setMobileRenameOpen,
    setProjectTitle,
  };
}

"use client";

import { useEffect } from "react";

import { PROJECT_DRAFT_STORAGE_KEY } from "@/lib/projects/draft";

export function ClearProjectDraft() {
  useEffect(() => {
    window.localStorage.removeItem(PROJECT_DRAFT_STORAGE_KEY);
  }, []);

  return null;
}

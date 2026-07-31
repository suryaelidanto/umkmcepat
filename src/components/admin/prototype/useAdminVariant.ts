"use client";

import { useRouter, useRouterState, useSearch } from "@tanstack/react-router";

import { type AdminVariant, parseAdminVariant, VARIANT_LABELS } from "./types";

export function useAdminVariant(): AdminVariant {
  const search = useSearch({ strict: false }) as { variant?: unknown };
  return parseAdminVariant(search.variant);
}

export function useSetAdminVariant() {
  const router = useRouter();
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const search = useRouterState({
    select: (s) => s.location.search as string,
  });

  return (variant: AdminVariant) => {
    const raw = typeof search === "string" ? search : "";
    const params = new URLSearchParams(
      raw.startsWith("?") ? raw.slice(1) : raw,
    );
    if (variant === "A") {
      params.delete("variant");
    } else {
      params.set("variant", variant);
    }
    const q = params.toString();
    router.history.replace(q ? `${pathname}?${q}` : pathname);
  };
}

export function variantLabel(v: AdminVariant): string {
  return `${v} — ${VARIANT_LABELS[v]}`;
}

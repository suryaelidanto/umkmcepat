// src/lib/projects/scaffold/protected-paths.ts

export const PROTECTED_SCAFFOLD_PATHS: readonly string[] = [
  "src/content/site.ts",
  "src/index.css",
  "src/main.tsx",
  "src/router.tsx",
  "src/routes/__root.tsx",
  "src/lib/preview-ready.ts",
  "src/lib/utils.ts",
  "src/components/site/layout.tsx",
  "src/components/ui/button.tsx",
  "src/components/ui/card.tsx",
];

export function isProtectedScaffoldPath(path: string): boolean {
  return PROTECTED_SCAFFOLD_PATHS.includes(path);
}

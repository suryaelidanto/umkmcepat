// src/lib/projects/scaffold/protected-paths.ts
// Platform-owned files the batched writer (generate + edit) may never
// overwrite. The parser's allow-list is syntactic (src/ + public/); THIS list
// is the semantic gate enforced by the runners at merge/stage time — a stray
// emission is dropped and surfaces as a diagnostic for targeted repair
// instead of latching a hard parse error (see batched-response.ts header).

export const PROTECTED_SCAFFOLD_PATHS: readonly string[] = [
  "src/content/site.ts",
  "src/index.css",
  "src/main.tsx",
  "src/routes/__root.tsx",
  "src/lib/preview-ready.ts",
  "src/lib/utils.ts",
];

export function isProtectedScaffoldPath(path: string): boolean {
  return PROTECTED_SCAFFOLD_PATHS.includes(path);
}

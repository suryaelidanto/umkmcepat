// Maintainer-run, one-time fetch of the full shadcn/ui v4 "new-york"
// component set into src/lib/projects/scaffold/shadcn-components.ts.
// NOT wired into builds. After running once the sources are local forever.
//
// Usage: node scripts/fetch-shadcn-components.mjs
//   or:  bun scripts/fetch-shadcn-components.mjs
//
// Registry: https://ui.shadcn.com/r/styles/new-york-v4/<name>.json
//   files[0].content = TSX source (unified `radix-ui` imports).
// We split each `import { X as Y } from "radix-ui"` into
// `import { X as Y } from "@radix-ui/react-<kebab-name>"` to match the
// pre-unification canonical shape already seeded for the 6 base components.

/* eslint-disable no-console */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "src/lib/projects/scaffold/shadcn-components.ts");

const REGISTRY_BASE = "https://ui.shadcn.com/r/styles/new-york-v4";

// Components to fetch. Verified against https://ui.shadcn.com/r/index.json
// (type === "registry:ui"). Excludes chart/sidebar (extra deps/hooks beyond
// a single TSX file — keep the AI-pickable surface to self-contained UI atoms).
const COMPONENTS = [
  "accordion",
  "alert",
  "alert-dialog",
  "aspect-ratio",
  "avatar",
  "badge",
  "breadcrumb",
  "button",
  "calendar",
  "card",
  "carousel",
  "checkbox",
  "collapsible",
  "command",
  "context-menu",
  "dialog",
  "drawer",
  "dropdown-menu",
  "form",
  "hover-card",
  "input",
  "input-otp",
  "label",
  "menubar",
  "navigation-menu",
  "pagination",
  "popover",
  "progress",
  "radio-group",
  "resizable",
  "scroll-area",
  "select",
  "separator",
  "sheet",
  "skeleton",
  "slider",
  "sonner",
  "spinner",
  "switch",
  "table",
  "tabs",
  "textarea",
  "toggle",
  "toggle-group",
  "tooltip",
];

// Map the radix primitive alias used in the import to its split package name.
// The registry unifies everything under `radix-ui`; the pre-unification
// canonical shadcn form was `@radix-ui/react-<kebab>`. The import binding
// (e.g. `Dialog as DialogPrimitive`) tells us which sub-package to use.
const RADIX_ALIAS_TO_PACKAGE = {
  Accordion: "accordion",
  AlertDialog: "alert-dialog",
  AspectRatio: "aspect-ratio",
  Avatar: "avatar",
  Checkbox: "checkbox",
  Collapsible: "collapsible",
  ContextMenu: "context-menu",
  Dialog: "dialog",
  Drawer: "dialog", // vaul exports as DialogPrimitive-compatible alias; shadcn uses react-dialog alias
  DropdownMenu: "dropdown-menu",
  HoverCard: "hover-card",
  Label: "label",
  Menubar: "menubar",
  NavigationMenu: "navigation-menu",
  Popover: "popover",
  Progress: "progress",
  RadioGroup: "radio-group",
  ScrollArea: "scroll-area",
  Select: "select",
  Separator: "separator",
  Sheet: "dialog",
  Slider: "slider",
  Switch: "switch",
  Tabs: "tabs",
  Toggle: "toggle",
  ToggleGroup: "toggle-group",
  Tooltip: "tooltip",
  // Slot is imported directly (no `as` alias) — handled separately below.
};

/**
 * Split unified `import { X as Y, ... } from "radix-ui"` (and the
 * `import type { ... }` form) into `import { ... } from "@radix-ui/react-<pkg>"`.
 *
 * The registry uses one binding per radix import line (e.g.
 * `import { Dialog as DialogPrimitive } from "radix-ui"`). We map the
 * binding's left side (the radix primitive name, e.g. `Dialog`) to its
 * package kebab-name. `Slot` imports have no alias; they always map to
 * `@radix-ui/react-slot`.
 *
 * If the source already uses split imports (no `from "radix-ui"` lines),
 * this is a no-op.
 *
 * The `import type` form is preserved as `import type` so type-only
 * re-exports (e.g. `import type { Label as LabelPrimitive } from "radix-ui"`
 * in form.tsx) keep their type-only semantics.
 */
function transformRadixImports(src) {
  // Matches: import [type] { <specifiers> } from "radix-ui"
  const radixImportRe =
    /^import\s+(type\s+)?\{([^}]+)\}\s*from\s*"radix-ui"\s*$/gm;

  let sawSlotValueImport = false;

  const out = src.replace(radixImportRe, (whole, typeKw, specifiersRaw) => {
    const specifiers = specifiersRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const first = specifiers[0];
    const primitiveName = first.split(/\s+as\s+/)[0].trim();

    let pkg;
    if (primitiveName === "Slot" || primitiveName === "Slottable") {
      pkg = "slot";
      if (!typeKw) {
        sawSlotValueImport = true;
      }
    } else if (RADIX_ALIAS_TO_PACKAGE[primitiveName]) {
      pkg = RADIX_ALIAS_TO_PACKAGE[primitiveName];
    } else {
      pkg = primitiveName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    }

    const kw = typeKw ? "type " : "";
    return `import ${kw}{ ${specifiers.join(", ")} } from "@radix-ui/react-${pkg}"`;
  });

  // The unified `radix-ui` exposes `Slot` as a namespace with `.Root`,
  // but the split `@radix-ui/react-slot` exports `Slot` itself as the
  // component (no `.Root` member). shadcn's form.tsx uses `<Slot.Root>`
  // and `typeof Slot.Root` — collapse these to `Slot` so the split
  // package's single Slot export covers both the type and value usage.
  // (Only applies when a value Slot import was present.)
  if (sawSlotValueImport) {
    return out.replace(/\bSlot\.Root\b/g, "Slot");
  }
  return out;
}

/**
 * Rewrite cross-component imports from the registry's internal path
 * (`@/registry/new-york-v4/ui/<x>`) to the generated project's alias
 * (`@/components/ui/<x>`) declared in components.json. Without this, a
 * fetched component that re-imports a sibling (e.g. alert-dialog imports
 * Button) would point at a path that doesn't exist in the generated project.
 */
function transformRegistryImports(src) {
  return src.replace(/@\/registry\/new-york-v4\/ui\//g, "@/components/ui/");
}

function toConstName(name) {
  return name.toUpperCase().replace(/-/g, "_") + "_TSX";
}

async function fetchComponent(name) {
  const url = `${REGISTRY_BASE}/${name}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const json = await res.json();
  const files = Array.isArray(json.files) ? json.files : [];
  // registry:ui components expose exactly one TSX file at
  // registry/new-york-v4/ui/<name>.tsx. Pick the .tsx file (the registry
  // sometimes also lists a .css or other non-tsx file for some components).
  const tsx = files.find((f) => String(f.path).endsWith(".tsx"));
  if (!tsx || typeof tsx.content !== "string") {
    throw new Error(`No .tsx file in ${url}`);
  }
  return transformRegistryImports(transformRadixImports(tsx.content));
}

function buildOutput(entries) {
  const header = `import type { GeneratedProjectFile } from "@/lib/projects/generated-types";

/**
 * Seeded shadcn/ui "new-york" + Tailwind v4 component sources.
 *
 * Source-copied verbatim from the canonical shadcn registry
 * (apps/v4/registry/new-york-v4/ui/*.tsx) with one transformation: the
 * unified \`radix-ui\` import is split into the individual \`@radix-ui/react-*\`
 * packages the platform allowlist permits (the pre-unification canonical
 * shadcn shape). MIT-licensed source — see LICENSE at shadcn-ui/ui.
 *
 * ponytail: when the platform allowlist adds the unified \`radix-ui\`
 * package, revert these imports to \`import { Slot } from "radix-ui"\` etc.
 * to match the latest shadcn registry verbatim.
 */

const UTILS_TS = \`import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
\`;

const COMPONENTS_JSON = \`{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
\`;
`;

  const consts = entries
    .map(
      (e) => `const ${toConstName(e.name)} = ${JSON.stringify(e.content)};\n`,
    )
    .join("\n");

  const arr = entries
    .map(
      (e) =>
        `  { path: "src/components/ui/${e.name}.tsx", content: ${toConstName(
          e.name,
        )} },`,
    )
    .join("\n");

  const footer = `
export const SHADCN_COMPONENT_FILES: GeneratedProjectFile[] = [
  { path: "src/lib/utils.ts", content: UTILS_TS },
  { path: "components.json", content: COMPONENTS_JSON },
${arr}
];
`;

  return `${header}\n${consts}${footer}\n`;
}

async function main() {
  console.log(
    `Fetching ${COMPONENTS.length} components from ${REGISTRY_BASE} ...`,
  );
  const entries = [];
  for (const name of COMPONENTS) {
    process.stdout.write(`  ${name} ... `);
    try {
      const content = await fetchComponent(name);
      entries.push({ name, content });
      console.log("ok");
    } catch (err) {
      console.log(`FAIL: ${err.message}`);
      throw err;
    }
  }

  // Alphabetize for stable diffs.
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const output = buildOutput(entries);
  writeFileSync(OUT, output, "utf8");
  console.log(`\nWrote ${entries.length} components to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

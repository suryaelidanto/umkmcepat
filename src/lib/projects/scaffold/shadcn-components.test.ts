import { describe, expect, it } from "vitest";

import {
  resolveShadcnDeps,
  SHADCN_COMPONENT_BY_NAME,
  SHADCN_COMPONENT_FILES,
} from "./shadcn-components";

describe("SHADCN_COMPONENT_BY_NAME", () => {
  it("keys every src/components/ui/*.tsx entry by bare name", () => {
    const uiFiles = SHADCN_COMPONENT_FILES.filter((f) =>
      f.path.startsWith("src/components/ui/"),
    );
    expect(SHADCN_COMPONENT_BY_NAME.size).toBe(uiFiles.length);
    for (const f of uiFiles) {
      const name = f.path
        .replace("src/components/ui/", "")
        .replace(/\.tsx$/, "");
      expect(SHADCN_COMPONENT_BY_NAME.get(name)).toBe(f);
    }
  });

  it("does not key utils.ts or components.json", () => {
    expect(SHADCN_COMPONENT_BY_NAME.has("utils")).toBe(false);
  });

  it("looks up dialog", () => {
    expect(SHADCN_COMPONENT_BY_NAME.get("dialog")?.path).toBe(
      "src/components/ui/dialog.tsx",
    );
  });
});

describe("resolveShadcnDeps", () => {
  const get = (name: string) => SHADCN_COMPONENT_BY_NAME.get(name)!;
  const paths = (files: { path: string }[]) => files.map((f) => f.path).sort();

  it("returns empty for a component with no ui deps", () => {
    const separator = get("separator");
    expect(resolveShadcnDeps(separator, [])).toEqual([]);
  });

  it("pulls a direct ui dep (alert-dialog → button)", () => {
    const alertDialog = get("alert-dialog");
    const deps = resolveShadcnDeps(alertDialog, []);
    expect(paths(deps)).toContain("src/components/ui/button.tsx");
  });

  it("excludes deps already present", () => {
    const alertDialog = get("alert-dialog");
    const button = get("button");
    const deps = resolveShadcnDeps(alertDialog, [button]);
    expect(paths(deps)).not.toContain("src/components/ui/button.tsx");
  });

  it("resolves transitively (toggle-group → toggle), root excluded", () => {
    const toggleGroup = get("toggle-group");
    const deps = resolveShadcnDeps(toggleGroup, []);
    // root (toggle-group) is NOT in the returned deps — caller prepends it.
    expect(deps.map((f) => f.path)).toEqual(["src/components/ui/toggle.tsx"]);
  });

  it("is cycle-safe", () => {
    // No real shadcn cycle exists; guard against a hypothetical self-import.
    const self = {
      content: 'import { X } from "@/components/ui/self"',
      path: "src/components/ui/self.tsx",
    };
    expect(() => resolveShadcnDeps(self, [])).not.toThrow();
  });
});

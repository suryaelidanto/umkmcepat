import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BuildProgressPanel } from "./WorkspaceBuildProgress";

function renderPanel(
  steps: React.ComponentProps<typeof BuildProgressPanel>["steps"],
  isBuilding = true,
) {
  return renderToStaticMarkup(
    createElement(BuildProgressPanel, {
      elapsedFrom: Date.now() - 3_000,
      isBuilding,
      steps,
    }),
  );
}

describe("BuildProgressPanel live workshop copy", () => {
  it("shows truthful completed momentum without fake percentages", () => {
    const markup = renderPanel([
      { detail: "", label: "Menyiapkan website", status: "done" },
      { detail: "index.tsx", label: "Menulis file", status: "done" },
      { detail: "produk.tsx", label: "Menulis file", status: "done" },
      { detail: "", label: "Memeriksa website", status: "active" },
    ]);

    expect(markup).toContain("3 bagian sudah selesai");
    expect(markup).toContain("Website sedang dibuat");
    expect(markup).toContain("Memeriksa website");
    expect(markup).not.toMatch(/\d+%/);
    expect(markup).not.toMatch(/perkiraan|tersisa/i);
  });

  it("uses a friendly active fallback before the first real event", () => {
    const markup = renderPanel([]);

    expect(markup).toContain("Menyiapkan website");
    expect(markup).toContain("Setiap bagian akan muncul saat selesai.");
    expect(markup).not.toContain("Memulai build");
    expect(markup).not.toMatch(/writer|worker|agent|batched|compile/i);
  });
});

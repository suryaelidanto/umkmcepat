import type { GeneratedProjectFile } from "./generated-types";

export type ProfessionalDefectCategory =
  | "business_specificity"
  | "first_view_hierarchy"
  | "content_architecture"
  | "composition_rhythm"
  | "typography"
  | "color_system"
  | "media_integrity"
  | "mobile_quality"
  | "professional_finish";

export type ProfessionalDefectDefinition = {
  id: string;
  category: ProfessionalDefectCategory;
  severity: "blocker";
  operator: string;
  parameters: Record<string, unknown>;
  expectedRatingMaximum: 1 | 2;
};

const ROUTE_PATH = /^src\/routes\/(?!__root|not-found).*\.tsx$/;

export function applyProfessionalDefect(
  files: GeneratedProjectFile[],
  defect: ProfessionalDefectDefinition,
): GeneratedProjectFile[] {
  const route = files.find((file) => ROUTE_PATH.test(file.path));
  if (!route) {
    throw new Error(`defect requires a route file: ${defect.operator}`);
  }
  const css = files.find((file) => file.path === "src/index.css");
  const routeContent = mutateRoute(route.content, defect);
  const cssContent = css ? mutateCss(css.content, defect) : null;
  if (routeContent === route.content && cssContent === css?.content) {
    throw new Error(
      `defect operator made no source change: ${defect.operator}`,
    );
  }
  return files.map((file) => {
    if (file.path === route.path) {
      return { ...file, content: routeContent };
    }
    if (css && file.path === css.path && cssContent !== null) {
      return { ...file, content: cssContent };
    }
    return file;
  });
}

function mutateRoute(
  source: string,
  defect: ProfessionalDefectDefinition,
): string {
  switch (defect.operator) {
    case "replace-business-specific-copy":
      return replaceOrInject(
        source,
        "site.businessName",
        '"Usaha Pilihan"',
        defect,
      );
    case "remove-offer-binding":
      return replaceOrInject(source, "site.offer", '""', defect);
    case "replace-audience-binding":
      return replaceOrInject(source, "site.audience", '"Semua orang"', defect);
    case "move-primary-action-below-mobile-fold":
      return replaceOrInject(
        source,
        "data-primary-action",
        'data-primary-action className="mt-[900px]"',
        defect,
      );
    case "hide-first-view-identity":
      return replaceOrInject(
        source,
        "data-first-view",
        'data-first-view className="hidden"',
        defect,
      );
    case "hide-first-view-offer":
      return replaceOrInject(source, "site.offer", '""', defect);
    case "duplicate-primary-action":
      return injectBeforeMainClose(
        source,
        '<a data-primary-action href="#duplicate">Duplikat</a>',
        defect,
      );
    case "remove-required-section":
      return replaceOrInject(
        source,
        "data-section-id",
        'data-section-id="removed" hidden',
        defect,
      );
    case "move-content-to-wrong-route":
      return replaceOrInject(
        source,
        "data-section-id",
        'data-section-id="wrong-route"',
        defect,
      );
    case "add-unknown-site-field":
      return injectBeforeMainClose(
        source,
        "<p>Field tidak dikenal</p>",
        defect,
      );
    case "equalize-section-treatments":
      return replaceOrInject(
        source,
        "data-section-id",
        'data-section-id="equal-treatment" className="rounded-xl border p-4"',
        defect,
      );
    case "repeat-card-treatment":
      return injectBeforeMainClose(
        source,
        '<div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><div className="rounded-xl border p-4">Pilihan</div><div className="rounded-xl border p-4">Pilihan</div><div className="rounded-xl border p-4">Pilihan</div><div className="rounded-xl border p-4">Pilihan</div><div className="rounded-xl border p-4">Pilihan</div></div>',
        defect,
      );
    case "uniform-section-spacing":
      return replaceOrInject(
        source,
        "data-section-id",
        'data-section-id="uniform-spacing" className="space-y-4"',
        defect,
      );
    case "nest-card-surfaces":
      return injectBeforeMainClose(
        source,
        '<div className="rounded-xl border p-4"><div className="rounded-xl border p-4">Nested</div></div>',
        defect,
      );
    case "shrink-body-type":
      return replaceOrInject(source, "text-base", "text-[12px]", defect);
    case "oversize-display-type":
      return replaceOrInject(source, "text-5xl", "text-[120px]", defect);
    case "add-arbitrary-font":
      return replaceOrInject(
        source,
        "className=",
        'style={{ fontFamily: "Comic Sans MS" }} className=',
        defect,
      );
    case "remove-font-role":
      return replaceOrInject(source, "font-body", "font-sans", defect);
    case "add-raw-palette":
      return replaceOrInject(source, "bg-background", "bg-[#ff00ff]", defect);
    case "lower-contrast-theme":
      return replaceOrInject(
        source,
        "text-foreground",
        "text-[#999999]",
        defect,
      );
    case "cover-page-in-accent":
      return replaceOrInject(source, "bg-background", "bg-primary", defect);
    case "add-placeholder-media":
      return injectBeforeMainClose(
        source,
        "<div data-media-placeholder>Placeholder</div>",
        defect,
      );
    case "add-remote-media":
      return injectBeforeMainClose(
        source,
        '<img src="https://example.com/image.jpg" alt="Remote" />',
        defect,
      );
    case "add-empty-media-frame":
      return injectBeforeMainClose(
        source,
        '<div data-media-frame className="h-64" />',
        defect,
      );
    case "add-horizontal-overflow":
      return replaceOrInject(
        source,
        "min-h-dvh",
        "min-h-dvh w-[1200px]",
        defect,
      );
    case "cover-section-with-fixed-nav":
      return injectBeforeMainClose(
        source,
        '<nav className="fixed inset-0">Menu</nav>',
        defect,
      );
    case "shrink-primary-touch-target":
      return replaceOrInject(
        source,
        "data-primary-action",
        'data-primary-action className="h-4 w-4"',
        defect,
      );
    case "add-starter-residue":
      return injectBeforeMainClose(source, "<h2>Card Grid</h2>", defect);
    case "add-gradient-text":
      return replaceOrInject(
        source,
        "text-foreground",
        "bg-gradient-to-r bg-clip-text text-transparent",
        defect,
      );
    case "add-numbered-scaffold":
      return injectBeforeMainClose(source, "<p>01 02 03</p>", defect);
    default:
      throw new Error(
        `unknown professional defect operator: ${defect.operator}`,
      );
  }
}

function mutateCss(
  source: string,
  defect: ProfessionalDefectDefinition,
): string {
  if (
    defect.category === "color_system" &&
    defect.operator === "add-raw-palette"
  ) {
    return `${source}\n:root { --calibration-raw-palette: #ff00ff; }\n`;
  }
  if (
    defect.category === "typography" &&
    defect.operator === "add-arbitrary-font"
  ) {
    return `${source}\n:root { --calibration-font: Comic Sans MS; }\n`;
  }
  return source;
}

function replaceOrInject(
  source: string,
  needle: string,
  replacement: string,
  defect: ProfessionalDefectDefinition,
): string {
  const index = source.indexOf(needle);
  if (index >= 0) {
    return `${source.slice(0, index)}${replacement}${source.slice(index + needle.length)}`;
  }
  return injectBeforeMainClose(
    source,
    `<span data-calibration-defect="${defect.id}">${replacement}</span>`,
    defect,
  );
}

function injectBeforeMainClose(
  source: string,
  insertion: string,
  defect: ProfessionalDefectDefinition,
): string {
  const index = source.lastIndexOf("</main>");
  if (index < 0) {
    throw new Error(`defect route has no main boundary: ${defect.operator}`);
  }
  return `${source.slice(0, index)}${insertion}${source.slice(index)}`;
}

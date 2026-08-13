import {
  compileShadcnTheme,
  type ThemeContrastCheck,
} from "./scaffold/shadcn-theme";
import {
  createFallbackProjectSiteSchema,
  type ProjectSiteSchema,
} from "./site-schema";

import type { GeneratedSiteDesignKitV1 } from "./generated-site-design-kits/types";
import type { WriterDesignPlanV2 } from "./generated-site-design-plan";
import type { GeneratedProjectFile } from "./generated-types";

export type CompiledGeneratedSiteThemeV2 = {
  schemaTheme: ProjectSiteSchema["theme"];
  css: string;
  checks: ThemeContrastCheck[];
};

export function compileGeneratedSiteThemeV2(input: {
  kit: GeneratedSiteDesignKitV1;
  palette: WriterDesignPlanV2["palette"];
}): CompiledGeneratedSiteThemeV2 {
  const palette = input.palette;
  if (
    !isHex(palette.background) ||
    !isHex(palette.foreground) ||
    !isHex(palette.muted) ||
    !isHex(palette.accent)
  ) {
    throw new Error("invalid generated theme palette");
  }
  const backgroundLuminance = luminance(palette.background);
  if (
    (input.kit.themePolicy.backgroundLightness === "dark" &&
      backgroundLuminance > 0.4) ||
    (input.kit.themePolicy.backgroundLightness === "light" &&
      backgroundLuminance < 0.4)
  ) {
    throw new Error("generated theme background conflicts with kit policy");
  }
  const schema = createFallbackProjectSiteSchema(input.kit.id);
  schema.theme = { ...palette };
  const compiled = compileShadcnTheme(schema);
  if (compiled.checks.some((check) => !check.pass)) {
    throw new Error("generated theme failed contrast checks");
  }
  return {
    schemaTheme: schema.theme,
    css: compiled.css,
    checks: compiled.checks,
  };
}

export function applyGeneratedSiteThemeV2(input: {
  files: GeneratedProjectFile[];
  schema: ProjectSiteSchema;
  theme: CompiledGeneratedSiteThemeV2;
}): GeneratedProjectFile[] {
  const siteContent = `export const site = ${JSON.stringify(
    { ...input.schema, theme: input.theme.schemaTheme },
    null,
    2,
  )} as const;\nexport default site;\n`;
  return input.files.map((file) => {
    if (file.path === "src/index.css") {
      return { ...file, content: input.theme.css };
    }
    if (file.path === "src/content/site.ts") {
      return { ...file, content: siteContent };
    }
    return file;
  });
}

function isHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function luminance(value: string): number {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255,
  );
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

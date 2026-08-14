export type GeneratedSiteDesignKitId =
  | "editorial-airy"
  | "menu-led-editorial"
  | "catalog-story"
  | "warm-commerce"
  | "bold-typographic";

export type GeneratedSiteKitDensity = "sparse" | "regular" | "rich";
export type GeneratedSiteKitMediaMode =
  "owner_assets" | "graphic" | "typographic";

export type GeneratedSiteTasteProfile = {
  variance: number;
  motion: number;
  density: number;
  shape: "sharp" | "soft" | "pill";
  typeGuidance: string;
  signatureBudget: 1;
};

export type GeneratedSitePrimaryJobKind =
  "browse" | "compare" | "inquire" | "book" | "visit";

export type GeneratedSiteDesignKitV1 = {
  id: GeneratedSiteDesignKitId;
  version: 1;
  referenceLabels: Array<"01" | "02" | "03" | "04" | "07">;
  compatibleArchetypes: string[];
  compatibleMediaModes: GeneratedSiteKitMediaMode[];
  compatibleDensities: GeneratedSiteKitDensity[];
  compositionPatterns: Array<{
    id: string;
    intent: string;
    requires: string[];
    forbids: string[];
  }>;
  typography: {
    displayRole: "serif" | "sans";
    bodyRole: "sans" | "serif";
    maxDisplayRem: number;
    maxBodyCh: number;
  };
  themePolicy: {
    temperature: "warm" | "cool" | "neutral";
    backgroundLightness: "light" | "dark" | "either";
    accentSurfaceMaximum: number;
  };
  taste: GeneratedSiteTasteProfile;
  rhythm: {
    sectionSpacingRem: [number, number];
    allowAlternatingSurfaces: boolean;
  };
  primitiveFileIds: string[];
  sourceAssertions: string[];
  browserAssertions: string[];
  criticRubric: string[];
  antiPatterns: string[];
};

export type GeneratedSiteKitSelectionInput = {
  archetype: string;
  density: GeneratedSiteKitDensity;
  mediaMode: GeneratedSiteKitMediaMode;
  primaryJobKind: GeneratedSitePrimaryJobKind;
  hasOperationalDetails: boolean;
};

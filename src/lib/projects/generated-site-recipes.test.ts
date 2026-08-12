import { describe, expect, it } from "vitest";

import { KNOWN_ARCHETYPE_IDS } from "./archetypes";
import {
  selectGeneratedSiteGoldExample,
  selectGeneratedSiteRecipe,
} from "./generated-site-recipes";

describe("generated-site recipes", () => {
  it.each(KNOWN_ARCHETYPE_IDS)("maps %s to a versioned recipe", (archetype) => {
    const recipe = selectGeneratedSiteRecipe(archetype);
    expect(recipe.version).toBe(1);
    expect(recipe.compatibleArchetypes).toContain(archetype);
    expect(recipe.hierarchy.length).toBeGreaterThan(1);
    expect(recipe.avoidPatterns).toContain("starter-centered-card-stack");
  });

  it("selects one compatible example for the media mode", () => {
    const example = selectGeneratedSiteGoldExample({
      recipeId: "retail-catalog",
      mediaMode: "replaceable_slots",
    });
    expect(example.recipeId).toBe("retail-catalog");
    expect(example.mediaModes).toContain("replaceable_slots");
    expect(example.source).not.toContain(
      "Replace this with the real home page",
    );
  });

  it("falls back to generic for an unknown archetype", () => {
    expect(selectGeneratedSiteRecipe("unknown").id).toBe("generic");
  });
});

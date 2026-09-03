import { createHash } from "node:crypto";

import { canonicalJson } from "./canonical-json";

import type { ProjectBriefV2 } from "./canonical-brief";

const BRIEF_HASH_PREFIX = "umkmcepat:project-brief:v2:";

export function hashCanonicalBrief(brief: ProjectBriefV2): string {
  return createHash("sha256")
    .update(BRIEF_HASH_PREFIX + canonicalJson(brief), "utf8")
    .digest("hex");
}

export function hashCanonicalBriefContent(brief: ProjectBriefV2): string {
  const {
    discussionContext: _discussionContext,
    factLedger: _factLedger,
    ...content
  } = brief;
  return createHash("sha256")
    .update(BRIEF_HASH_PREFIX + canonicalJson(content), "utf8")
    .digest("hex");
}

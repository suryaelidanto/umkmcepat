// src/lib/projects/generated-write-policy.ts
import { scanSourceClaims } from "./high-risk-claims";
import { buildAllowList } from "./topology-compiler";

import type { BuildPlanV1 } from "./build-plan";

export type WritePolicyInput = {
  engine: string;
  plan: BuildPlanV1;
  filePath: string;
  content: string;
};

export type WritePolicyResult = { ok: true } | { ok: false; reasons: string[] };

export function enforceGeneratedWritePolicy(
  input: WritePolicyInput,
): WritePolicyResult {
  if (input.engine !== "contract" && input.engine !== "contract-v1") {
    return { ok: true };
  }
  const allowList = buildAllowList(input.plan);
  const allowed = allowList.some((p) => {
    if (p.endsWith("/**")) {
      const base = p.slice(0, -2);
      return input.filePath.startsWith(base);
    }
    return input.filePath === p;
  });
  if (!allowed) {
    return {
      ok: false,
      reasons: [`path ${input.filePath} outside contract allow-list`],
    };
  }
  const claims = scanSourceClaims(input.content, { file: input.filePath });
  if (claims.length) {
    return {
      ok: false,
      reasons: claims.map(
        (c) => `high-risk claim (${c.category}) in ${input.filePath}`,
      ),
    };
  }
  return { ok: true };
}

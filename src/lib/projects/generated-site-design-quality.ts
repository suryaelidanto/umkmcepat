import type { GeneratedSiteWriterContractV2 } from "./generated-site-contract";

export type GeneratedSitePageStrategy = {
  mode: "single" | "multi";
  reason: "single-primary-job" | "distinct-routes";
  routeCount: number;
};

export function deriveGeneratedSitePageStrategy(
  input:
    | Pick<GeneratedSiteWriterContractV2, "obligations">
    | {
        obligations: {
          routes: Array<{ path: string; purpose: string }>;
        };
      },
): GeneratedSitePageStrategy {
  const routeCount = new Set(
    input.obligations.routes.map((route) => route.path),
  ).size;
  return routeCount > 1
    ? { mode: "multi", reason: "distinct-routes", routeCount }
    : { mode: "single", reason: "single-primary-job", routeCount };
}

import { useQueryClient } from "@tanstack/react-query";
import { useMatch } from "@tanstack/react-router";

import { queryKeys } from "@/lib/query-client";

type ProjectsCache = {
  pages: Array<{
    projectCount?: number;
    projectLimit?: number;
    overProjectLimit?: boolean;
  }>;
  pageParams: unknown[];
};

export type ProjectLimitInfo = {
  count: number;
  limit: number;
  overLimit: boolean;
};

export function readProjectLimitFromCache(
  cache: ProjectsCache | undefined,
): ProjectLimitInfo | null {
  const firstPage = cache?.pages[0];

  if (
    !cache ||
    !firstPage ||
    typeof firstPage.projectCount !== "number" ||
    typeof firstPage.projectLimit !== "number" ||
    typeof firstPage.overProjectLimit !== "boolean"
  ) {
    return null;
  }

  return {
    count: firstPage.projectCount,
    limit: firstPage.projectLimit,
    overLimit: firstPage.overProjectLimit,
  };
}

const FALLBACK_LIMIT: ProjectLimitInfo = {
  count: 0,
  limit: 0,
  overLimit: false,
};

export function useProjectLimit(): ProjectLimitInfo {
  const queryClient = useQueryClient();
  // shouldThrow: false so components using this hook (ProjectList,
  // HomePromptForm) can render outside the "/_main/" route match, e.g. in
  // Storybook, without pulling in the route module's server-only imports.
  const match = useMatch({ from: "/_main/", shouldThrow: false });
  const loader = match?.loaderData as
    | {
        overProjectLimit: boolean;
        projectCount: number;
        projectLimit: number;
      }
    | undefined;
  const cache = queryClient.getQueryData<ProjectsCache>(queryKeys.projects);
  const fromCache = readProjectLimitFromCache(cache);

  if (fromCache) {
    return fromCache;
  }

  if (!loader) {
    return FALLBACK_LIMIT;
  }

  return {
    count: loader.projectCount,
    limit: loader.projectLimit,
    overLimit: loader.overProjectLimit,
  };
}

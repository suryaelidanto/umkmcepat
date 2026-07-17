import { useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-client";
import { Route as HomeRoute } from "@/routes/_main.index";

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

export function useProjectLimit(): ProjectLimitInfo {
  const queryClient = useQueryClient();
  const loader = HomeRoute.useLoaderData() as {
    overProjectLimit: boolean;
    projectCount: number;
    projectLimit: number;
  };
  const cache = queryClient.getQueryData<ProjectsCache>(queryKeys.projects);
  const fromCache = readProjectLimitFromCache(cache);

  if (fromCache) {
    return fromCache;
  }

  return {
    count: loader.projectCount,
    limit: loader.projectLimit,
    overLimit: loader.overProjectLimit,
  };
}

import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { useMatch } from "@tanstack/react-router";

import { queryKeys } from "@/lib/query-client";

type ProjectsPage = {
  projectCount?: number;
  projectLimit?: number;
  overProjectLimit?: boolean;
};

export type ProjectLimitInfo = {
  count: number;
  limit: number;
  overLimit: boolean;
};

export function readProjectLimitFromCache(
  cache: { pages: ProjectsPage[] } | undefined,
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

  // ponytail: reactive subscription to projects cache so hero section
  // updates when project count changes (e.g. full → available). If query
  // hasn't been initialised yet we fall through to loader data.
  const { data: fromCache } = useInfiniteQuery<
    ProjectsPage,
    Error,
    ProjectLimitInfo | null
  >({
    queryKey: queryKeys.projects,
    queryFn: () => {
      throw new Error("useProjectLimit: piggybacks on ProjectList query");
    },
    enabled: false,
    initialPageParam: null as string | null,
    getNextPageParam: () => null,
    select: (data: InfiniteData<ProjectsPage>) =>
      readProjectLimitFromCache(data),
  });

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

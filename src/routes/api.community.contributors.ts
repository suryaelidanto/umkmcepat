import { createFileRoute } from "@tanstack/react-router";

import { getCommunityContributorsCached } from "@/lib/community-contributors";

export const Route = createFileRoute("/api/community/contributors")({
  server: {
    handlers: {
      GET: async () => {
        const contributors = await getCommunityContributorsCached();
        return Response.json(contributors, {
          headers: { "Cache-Control": "public, max-age=900, s-maxage=900" },
        });
      },
    },
  },
});

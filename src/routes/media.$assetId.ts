import { createFileRoute } from "@tanstack/react-router";

import { serveMediaAsset } from "@/routes/api.media.$assetId";

export const Route = createFileRoute("/media/$assetId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        return serveMediaAsset(params.assetId);
      },
    },
  },
});

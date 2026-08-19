import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import {
  deleteTempImage,
  readTempImage,
} from "@/lib/storage/uploads/temp-image-storage";

export const Route = createFileRoute("/api/uploads/temp-images/$assetId")({
  server: {
    handlers: {
      DELETE: async ({ params }) => {
        const session = await auth();
        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        await deleteTempImage(session.user.id, params.assetId);
        return new Response(null, { status: 204 });
      },
      GET: async ({ params }) => {
        const session = await auth();
        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        try {
          const image = await readTempImage(session.user.id, params.assetId);
          return new Response(new Uint8Array(image.body), {
            headers: {
              "Content-Type": image.contentType,
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});

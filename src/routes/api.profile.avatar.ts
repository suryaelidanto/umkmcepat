import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { getStoredObject, isObjectStorageRef } from "@/lib/object-storage";
import { prisma } from "@/lib/prisma";
import { parseLegacyProfileImage } from "@/lib/profile";

export const Route = createFileRoute("/api/profile/avatar")({
  server: {
    handlers: {
      GET: async () => {
        console.warn("[GET /api/profile/avatar] Hit");
        const session = await auth();

        if (!session?.user?.id) {
          console.warn("[GET /api/profile/avatar] No session or user id");
          return new Response(null, { status: 401 });
        }
        console.warn("[GET /api/profile/avatar] User ID:", session.user.id);

        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { image: true },
        });
        console.warn("[GET /api/profile/avatar] DB Image value:", user?.image);

        const image = isObjectStorageRef(user?.image)
          ? await getStoredObject(user?.image || "")
          : parseLegacyProfileImage(user?.image);

        if (!image) {
          console.warn(
            "[GET /api/profile/avatar] No image found on disk or parsed",
          );
          return new Response(null, { status: 404 });
        }
        console.warn(
          "[GET /api/profile/avatar] Image found, size:",
          image.body.byteLength,
          "contentType:",
          image.contentType,
        );

        return new Response(new Uint8Array(image.body), {
          headers: {
            "Cache-Control": "private, no-store",
            "Content-Length": image.body.byteLength.toString(),
            "Content-Type": image.contentType,
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { uploadTempImage } from "@/lib/uploads/temp-image-storage";

export const Route = createFileRoute("/api/uploads/temp-images")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth();
        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const form = await request.formData().catch(() => null);
        const file = form?.get("file");
        if (!(file instanceof File)) {
          return Response.json(
            { message: "Pilih gambar dulu." },
            { status: 400 },
          );
        }

        try {
          return Response.json(await uploadTempImage(session.user.id, file), {
            status: 201,
          });
        } catch (error) {
          return Response.json(
            {
              message:
                error instanceof Error
                  ? error.message
                  : "Gagal mengunggah gambar.",
            },
            { status: 400 },
          );
        }
      },
    },
  },
});

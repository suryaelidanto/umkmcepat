import { createFileRoute } from "@tanstack/react-router";

// Emits the same robots policy the previous Next MetadataRoute produced.
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () => {
        const siteUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
        const body = [
          "User-Agent: *",
          "Allow: /",
          "Disallow: /api/",
          "Disallow: /projects/",
          "",
          `Sitemap: ${siteUrl}/sitemap.xml`,
          "",
        ].join("\n");

        return new Response(body, {
          headers: { "Content-Type": "text/plain" },
        });
      },
    },
  },
});

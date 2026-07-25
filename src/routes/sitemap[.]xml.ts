import { createFileRoute } from "@tanstack/react-router";

import { prisma } from "@/lib/prisma";

const siteUrl = "https://umkmcepat.com";

// Enumerates the homepage + every published /p/<slug> deployment so Google
// indexes each published UMKM site (long-tail organic surface).
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const origin = process.env.GENERATED_PUBLIC_ORIGIN || siteUrl;
        const home = `  <url>\n    <loc>${origin}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1</priority>\n  </url>`;

        const deployments = await prisma.projectDeployment
          .findMany({
            select: { slug: true, updatedAt: true },
            where: { kind: "published" },
          })
          .catch(() => []);

        const published = (
          deployments as Array<{ slug: string; updatedAt: Date }>
        )
          .map((d) => {
            const safeSlug = encodeURIComponent(d.slug);
            const lastmod = d.updatedAt.toISOString();
            return `  <url>\n    <loc>${origin}/p/${safeSlug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
          })
          .join("\n");

        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${home}\n${published}\n</urlset>`;

        return new Response(body, {
          headers: { "Content-Type": "application/xml" },
        });
      },
    },
  },
});

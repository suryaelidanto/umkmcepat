import { createFileRoute } from "@tanstack/react-router";

import { prisma } from "@/lib/prisma";
import {
  isProjectDeploymentForProject,
  isSuccessfulBuildWithArtifact,
} from "@/lib/projects/deployment-resolution";

const siteUrl = "https://umkmcepat.com";

// Enumerates the homepage + every published /p/<slug> deployment so Google
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const origin = process.env.GENERATED_PUBLIC_ORIGIN || siteUrl;
        const staticPages = [
          `  <url>\n    <loc>${origin}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`,
          `  <url>\n    <loc>${origin}/waitlist</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`,
          `  <url>\n    <loc>${origin}/terms</loc>\n    <changefreq>yearly</changefreq>\n    <priority>0.3</priority>\n  </url>`,
          `  <url>\n    <loc>${origin}/privacy</loc>\n    <changefreq>yearly</changefreq>\n    <priority>0.3</priority>\n  </url>`,
        ].join("\n");

        const deployments = await prisma.projectDeployment
          .findMany({
            select: {
              build: {
                select: {
                  artifactRef: true,
                  id: true,
                  projectId: true,
                  snapshot: {
                    select: {
                      id: true,
                      projectId: true,
                      project: {
                        select: {
                          user: { select: { bannedAt: true } },
                        },
                      },
                    },
                  },
                  snapshotId: true,
                  status: true,
                },
              },
              buildId: true,
              id: true,
              kind: true,
              projectId: true,
              snapshot: { select: { id: true, projectId: true } },
              snapshotId: true,
              slug: true,
              updatedAt: true,
            },
            where: { kind: "published" },
          })
          .catch(() => []);

        const published = deployments
          .filter((deployment) => {
            const projectId = deployment.projectId;
            return (
              typeof deployment.slug === "string" &&
              deployment.slug.length > 0 &&
              isProjectDeploymentForProject(deployment, projectId) &&
              isSuccessfulBuildWithArtifact(deployment.build) &&
              !deployment.build?.snapshot?.project?.user?.bannedAt
            );
          })
          .map((d) => {
            if (typeof d.slug !== "string") {
              return null;
            }
            const safeSlug = encodeURIComponent(d.slug);
            const lastmod = d.updatedAt.toISOString();
            return `  <url>\n    <loc>${origin}/p/${safeSlug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
          })
          .filter((entry): entry is string => entry !== null)
          .join("\n");
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${staticPages}\n${published}\n</urlset>`;

        return new Response(body, {
          headers: { "Content-Type": "application/xml" },
        });
      },
    },
  },
});

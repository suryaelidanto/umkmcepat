import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createRuntimeEventData } from "@/lib/projects/runtime-events";

export const runtime = "nodejs";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, title: true },
  });

  if (!project) {
    return Response.json(
      { message: "Proyek tidak ditemukan." },
      { status: 404 },
    );
  }

  const build = await prisma.projectBuild.findFirst({
    where: {
      artifactRef: { not: null },
      projectId: project.id,
      status: "succeeded",
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, snapshotId: true },
  });

  if (!build) {
    return Response.json(
      { message: "Build berhasil belum tersedia untuk dipublish." },
      { status: 409 },
    );
  }

  const existingDeployment = await prisma.projectDeployment.findFirst({
    where: { kind: "published", projectId: project.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, slug: true },
  });
  const slug = existingDeployment?.slug || createPublishedSlug(project);
  const publicPath = `/p/${slug}`;
  const deployment = existingDeployment
    ? await prisma.projectDeployment.update({
        where: { id: existingDeployment.id },
        data: {
          buildId: build.id,
          publicPath,
          snapshotId: build.snapshotId,
          status: "created",
          stoppedAt: null,
        },
        select: { id: true },
      })
    : await prisma.projectDeployment.create({
        data: {
          buildId: build.id,
          kind: "published",
          projectId: project.id,
          publicPath,
          slug,
          snapshotId: build.snapshotId,
          status: "created",
        },
        select: { id: true },
      });

  await prisma.runtimeEvent.create({
    data: createRuntimeEventData({
      buildId: build.id,
      deploymentId: deployment.id,
      message: existingDeployment
        ? "Published deployment was updated to the latest build."
        : "Published deployment was created.",
      metadata: { publicPath, slug },
      projectId: project.id,
      type: "deployment.created",
    }),
  });

  return Response.json({ ok: true, path: publicPath, slug });
}

function createPublishedSlug(project: { id: string; title: string }) {
  const base =
    project.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 72) || "website";

  return `${base}-${project.id.slice(-6)}`;
}

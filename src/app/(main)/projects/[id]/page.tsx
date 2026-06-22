import { notFound, redirect } from "next/navigation";

import { ClearProjectDraft } from "@/components/projects/ClearProjectDraft";
import { WorkspaceShell } from "@/components/projects/WorkspaceShell";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: {
      id,
      userId: session.user.id,
    },
    select: {
      title: true,
      prompt: true,
      model: true,
    },
  });

  if (!project) {
    notFound();
  }

  return (
    <>
      <ClearProjectDraft />
      <WorkspaceShell
        projectTitle={project.title}
        initialModel={project.model}
        initialPrompt={project.prompt}
      />
    </>
  );
}

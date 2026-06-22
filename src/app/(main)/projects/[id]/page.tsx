import { redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/projects/WorkspaceShell";
import { auth } from "@/lib/auth";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ model?: string; prompt?: string }>;
};

export default async function ProjectPage({ searchParams }: ProjectPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;

  return (
    <WorkspaceShell
      initialModel={resolvedSearchParams?.model}
      initialPrompt={resolvedSearchParams?.prompt}
    />
  );
}

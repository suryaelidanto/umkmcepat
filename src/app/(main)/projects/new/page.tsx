import { redirect } from "next/navigation";

import { getAvailableAiModels, getDefaultAiModel } from "@/lib/ai-models";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProjectTitle } from "@/lib/projects/workspace";

type NewProjectPageProps = {
  searchParams?: Promise<{ model?: string; prompt?: string }>;
};

export default async function NewProjectPage({
  searchParams,
}: NewProjectPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;
  const prompt = resolvedSearchParams?.prompt?.trim() || "";
  const availableModels = getAvailableAiModels();
  const requestedModel = resolvedSearchParams?.model?.trim();
  const model = requestedModel || getDefaultAiModel(availableModels);

  const project = await prisma.project.create({
    data: {
      title: getProjectTitle(prompt),
      prompt,
      model,
      userId: session.user.id,
    },
    select: {
      id: true,
    },
  });

  redirect(`/projects/${project.id}`);
}

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

type NewProjectPageProps = {
  searchParams?: Promise<{ mode?: string; prompt?: string }>;
};

export default async function NewProjectPage({
  searchParams,
}: NewProjectPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  await searchParams;
  redirect("/");
}

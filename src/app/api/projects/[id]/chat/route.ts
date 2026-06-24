import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  CHAT_PAGE_SIZE,
  getProjectChatPage,
  parseProjectChatMessages,
} from "@/lib/projects/chat-memory";

export async function GET(
  request: Request,
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
  const url = new URL(request.url);
  const beforeParam = url.searchParams.get("before");
  const limitParam = url.searchParams.get("limit");
  const before = beforeParam ? Number(beforeParam) : null;
  const limit = limitParam ? Number(limitParam) : CHAT_PAGE_SIZE;

  const [row] = await prisma.$queryRaw<[{ chatMessages: unknown }]>`
    SELECT "chatMessages" FROM "Project" WHERE id = ${id} AND "userId" = ${session.user.id}
  `;

  if (!row) {
    return Response.json(
      { message: "Proyek tidak ditemukan." },
      { status: 404 },
    );
  }

  const page = getProjectChatPage(
    parseProjectChatMessages(row.chatMessages),
    Number.isFinite(before) ? before : null,
    Number.isFinite(limit) ? limit : CHAT_PAGE_SIZE,
  );

  return Response.json(page);
}

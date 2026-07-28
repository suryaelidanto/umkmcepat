import { SupportCategory, SupportTicketStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type TicketInput = {
  userId: string;
  subject: string;
  category: SupportCategory;
  body: string;
  assetIds?: string[];
};

export type MessageInput = {
  ticketId: string;
  authorId: string;
  authorRole: "user" | "admin";
  body: string;
  assetIds?: string[];
};

export async function createTicket(
  input: TicketInput,
): Promise<{ ticketId: string; firstMessageId: string }> {
  const subject = input.subject.trim();
  const body = input.body.trim();
  const assetIds = input.assetIds || [];

  if (subject.length > 140) {
    throw new Error("Subject maksimal 140 karakter.");
  }
  if (!body) {
    throw new Error("Pesan detail tidak boleh kosong.");
  }
  if (assetIds.length > 3) {
    throw new Error("Maksimal 3 lampiran diperbolehkan.");
  }

  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.create({
      data: {
        userId: input.userId,
        subject,
        category: input.category,
        status: SupportTicketStatus.OPEN,
      },
    });

    const message = await tx.supportMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: input.userId,
        authorRole: "user",
        body,
        assetIds,
      },
    });

    return {
      ticketId: ticket.id,
      firstMessageId: message.id,
    };
  });
}

export async function addMessage(
  input: MessageInput,
): Promise<{ messageId: string }> {
  const body = input.body.trim();
  const assetIds = input.assetIds || [];

  if (!body) {
    throw new Error("Pesan tidak boleh kosong.");
  }
  if (assetIds.length > 3) {
    throw new Error("Maksimal 3 lampiran diperbolehkan.");
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId },
  });

  if (!ticket) {
    throw new Error("Tiket tidak ditemukan.");
  }
  if (ticket.status === SupportTicketStatus.RESOLVED) {
    throw new Error("Tidak bisa membalas tiket yang sudah selesai.");
  }

  return prisma.$transaction(async (tx) => {
    const message = await tx.supportMessage.create({
      data: {
        ticketId: input.ticketId,
        authorId: input.authorId,
        authorRole: input.authorRole,
        body,
        assetIds,
      },
    });

    await tx.supportTicket.update({
      where: { id: input.ticketId },
      data: { updatedAt: new Date() },
    });

    return {
      messageId: message.id,
    };
  });
}

export async function resolveTicket(
  ticketId: string,
  userId: string,
  isAdmin: boolean,
): Promise<{ success: boolean }> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
  });

  if (!ticket) {
    throw new Error("Tiket tidak ditemukan.");
  }
  if (ticket.status === SupportTicketStatus.RESOLVED) {
    return { success: true };
  }

  if (!isAdmin) {
    if (ticket.userId !== userId) {
      throw new Error("Akses ditolak.");
    }
    // Check if last message is from user
    const lastMessage = await prisma.supportMessage.findFirst({
      where: { ticketId },
      orderBy: { createdAt: "desc" },
    });
    if (!lastMessage || lastMessage.authorRole !== "user") {
      throw new Error(
        "Hanya bisa menutup tiket setelah Anda mengirim pesan terakhir.",
      );
    }
  }

  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      status: SupportTicketStatus.RESOLVED,
      resolvedAt: new Date(),
      resolvedBy: isAdmin ? userId : null,
    },
  });

  return { success: true };
}

export type TicketBadgeCounts = {
  userUnreadCount: number;
  adminUnreadCount: number;
};

// 30s cache TTL using simple in-memory Map
const cache = new Map<
  string,
  { counts: TicketBadgeCounts; expiresAt: number }
>();
const CACHE_TTL_MS = 30 * 1000;

export async function getUnreadCounts(actor: {
  userId: string;
  isAdmin: boolean;
}): Promise<TicketBadgeCounts> {
  const cacheKey = `${actor.userId}-${actor.isAdmin}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.counts;
  }

  let userUnreadCount = 0;
  let adminUnreadCount = 0;

  if (actor.isAdmin) {
    // Admin unread count: count of OPEN tickets where the latest message's authorRole is 'user'
    // To do this query efficiently:
    const openTickets = await prisma.supportTicket.findMany({
      where: { status: SupportTicketStatus.OPEN },
      select: {
        id: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { authorRole: true },
        },
      },
    });
    adminUnreadCount = openTickets.filter(
      (t) => t.messages.length > 0 && t.messages[0].authorRole === "user",
    ).length;
  } else {
    // User unread count: count of own OPEN tickets
    userUnreadCount = await prisma.supportTicket.count({
      where: {
        userId: actor.userId,
        status: SupportTicketStatus.OPEN,
      },
    });
  }

  const counts = { userUnreadCount, adminUnreadCount };
  cache.set(cacheKey, { counts, expiresAt: now + CACHE_TTL_MS });

  return counts;
}

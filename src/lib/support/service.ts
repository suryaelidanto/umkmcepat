import { randomUUID } from "node:crypto";

import { SupportCategory, SupportTicketStatus } from "@prisma/client";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { putStoredObject } from "@/lib/storage/object-storage";
import { claimTempImage } from "@/lib/storage/uploads/temp-image-storage";

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

function normalizeAssetIds(assetIds: string[] | undefined) {
  return [...new Set(assetIds ?? [])];
}

async function claimSupportAsset(userId: string, assetId: string) {
  if (!assetId.includes(".")) {
    const claimed = await claimTempImage(userId, assetId);
    const ext =
      claimed.contentType === "image/png"
        ? "png"
        : claimed.contentType === "image/webp"
          ? "webp"
          : "jpg";
    const finalAssetId = `${randomUUID()}.${ext}`;
    await putStoredObject({
      body: claimed.body,
      contentType: claimed.contentType,
      key: `support/assets/${finalAssetId}`,
    });
    await prisma.supportAsset.create({
      data: { assetId: finalAssetId, uploadedById: userId },
    });
    return finalAssetId;
  }
  return assetId;
}

async function claimSupportAssets(userId: string, assetIds: string[]) {
  if (assetIds.length > 3) {
    throw new Error("Maksimal 3 lampiran diperbolehkan.");
  }
  return Promise.all(
    assetIds.map((assetId) => claimSupportAsset(userId, assetId)),
  );
}

async function bindSupportAssets(
  tx: Prisma.TransactionClient,
  input: {
    assetIds: string[];
    authorId: string;
    ticketId: string;
    messageId: string;
  },
) {
  if (!input.assetIds.length) {
    return;
  }

  const updated = await tx.supportAsset.updateMany({
    where: {
      assetId: { in: input.assetIds },
      uploadedById: input.authorId,
      ticketId: null,
      messageId: null,
    },
    data: {
      ticketId: input.ticketId,
      messageId: input.messageId,
    },
  });

  if (updated.count !== input.assetIds.length) {
    throw new Error("Lampiran tidak valid.");
  }
}

export async function createTicket(
  input: TicketInput,
): Promise<{ ticketId: string; firstMessageId: string }> {
  const subject = input.subject.trim();
  const body = input.body.trim();
  const assetIds = await claimSupportAssets(
    input.userId,
    normalizeAssetIds(input.assetIds),
  );

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

    await bindSupportAssets(tx, {
      assetIds,
      authorId: input.userId,
      ticketId: ticket.id,
      messageId: message.id,
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
  const assetIds = await claimSupportAssets(
    input.authorId,
    normalizeAssetIds(input.assetIds),
  );

  if (!body && assetIds.length === 0) {
    throw new Error("Pesan atau lampiran tidak boleh kosong.");
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
    if (input.authorRole !== "admin") {
      throw new Error("Tidak bisa membalas tiket yang sudah selesai.");
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const message = await tx.supportMessage.create({
      data: {
        ticketId: input.ticketId,
        authorId: input.authorId,
        authorRole: input.authorRole,
        body,
        assetIds,
      },
    });

    await bindSupportAssets(tx, {
      assetIds,
      authorId: input.authorId,
      ticketId: input.ticketId,
      messageId: message.id,
    });

    await tx.supportTicket.update({
      where: { id: input.ticketId },
      data: {
        status: SupportTicketStatus.OPEN,
        updatedAt: new Date(),
      },
    });

    return {
      messageId: message.id,
    };
  });

  invalidateUnreadCache();

  return result;
}

export async function reopenTicket(
  ticketId: string,
  _userId: string,
): Promise<{ success: boolean }> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
  });

  if (!ticket) {
    throw new Error("Tiket tidak ditemukan.");
  }
  if (ticket.status === SupportTicketStatus.OPEN) {
    return { success: true };
  }

  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      status: SupportTicketStatus.OPEN,
      resolvedAt: null,
      resolvedBy: null,
      updatedAt: new Date(),
    },
  });

  invalidateUnreadCache();

  return { success: true };
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
  }

  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      status: SupportTicketStatus.RESOLVED,
      resolvedAt: new Date(),
      resolvedBy: isAdmin ? userId : null,
    },
  });

  invalidateUnreadCache();

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

export function invalidateUnreadCache(userId?: string): void {
  if (userId) {
    cache.delete(`${userId}-false`);
    cache.delete(`${userId}-true`);
  } else {
    cache.clear();
  }
}

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
    // User unread count: count of OPEN tickets where the latest message was written by 'admin'
    const userOpenTickets = await prisma.supportTicket.findMany({
      where: {
        userId: actor.userId,
        status: SupportTicketStatus.OPEN,
      },
      select: {
        id: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { authorRole: true },
        },
      },
    });
    userUnreadCount = userOpenTickets.filter(
      (t) => t.messages.length > 0 && t.messages[0].authorRole === "admin",
    ).length;
  }

  const counts = { userUnreadCount, adminUnreadCount };
  cache.set(cacheKey, { counts, expiresAt: now + CACHE_TTL_MS });

  return counts;
}

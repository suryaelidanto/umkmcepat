import { SupportCategory, SupportTicketStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/uploads/temp-image-storage", () => ({
  claimTempImage: vi
    .fn()
    .mockRejectedValue(new Error("images not needed for this test")),
}));

vi.mock("@/lib/storage/object-storage", () => ({
  putStoredObject: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import {
  createTicket,
  addMessage,
  resolveTicket,
  getUnreadCounts,
} from "@/lib/support/service";

vi.mock("@/lib/prisma", () => {
  const prismaMock: Record<string, unknown> = {};

  prismaMock.supportTicket = {
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
  };

  prismaMock.supportMessage = {
    create: vi.fn(),
    findFirst: vi.fn(),
  };

  prismaMock.supportAsset = {
    create: vi.fn(),
    updateMany: vi.fn(),
  };

  prismaMock.$transaction = vi.fn();

  return { prisma: prismaMock };
});

describe("support service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createTicket", () => {
    it("validates subject length", async () => {
      await expect(
        createTicket({
          userId: "user-1",
          subject: "a".repeat(141),
          category: SupportCategory.TEKNIS,
          body: "Halo, ada masalah teknis.",
        }),
      ).rejects.toThrow("Subject maksimal 140 karakter.");
    });

    it("validates empty body", async () => {
      await expect(
        createTicket({
          userId: "user-1",
          subject: "Masalah baru",
          category: SupportCategory.TEKNIS,
          body: "   ",
        }),
      ).rejects.toThrow("Pesan detail tidak boleh kosong.");
    });

    it("validates assetIds count", async () => {
      await expect(
        createTicket({
          userId: "user-1",
          subject: "Masalah baru",
          category: SupportCategory.TEKNIS,
          body: "Halo",
          assetIds: ["1", "2", "3", "4"],
        }),
      ).rejects.toThrow("Maksimal 3 lampiran diperbolehkan.");
    });

    it("creates a ticket and first message in a transaction", async () => {
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (callback: (tx: unknown) => unknown) => {
          return callback(prisma);
        },
      );

      (
        prisma.supportTicket.create as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "ticket-1",
      });

      (
        prisma.supportMessage.create as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "message-1",
      });

      (
        prisma.supportAsset.updateMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ count: 1 });

      const result = await createTicket({
        userId: "user-1",
        subject: "Masalah",
        category: SupportCategory.TEKNIS,
        body: "Pesan pertama",
        assetIds: ["img-1.webp"],
      });

      expect(result).toEqual({
        ticketId: "ticket-1",
        firstMessageId: "message-1",
      });
      expect(prisma.supportTicket.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          subject: "Masalah",
          category: SupportCategory.TEKNIS,
          status: SupportTicketStatus.OPEN,
        },
      });
      expect(prisma.supportMessage.create).toHaveBeenCalledWith({
        data: {
          ticketId: "ticket-1",
          authorId: "user-1",
          authorRole: "user",
          body: "Pesan pertama",
          assetIds: ["img-1.webp"],
        },
      });
      expect(prisma.supportAsset.updateMany).toHaveBeenCalledWith({
        where: {
          assetId: { in: ["img-1.webp"] },
          uploadedById: "user-1",
          ticketId: null,
          messageId: null,
        },
        data: {
          ticketId: "ticket-1",
          messageId: "message-1",
        },
      });
    });
  });

  describe("addMessage", () => {
    it("validates asset count", async () => {
      await expect(
        addMessage({
          ticketId: "ticket-1",
          authorId: "user-1",
          authorRole: "user",
          body: "Pesan",
          assetIds: ["1", "2", "3", "4"],
        }),
      ).rejects.toThrow("Maksimal 3 lampiran diperbolehkan.");
    });

    it("validates ticket status is open", async () => {
      (
        prisma.supportTicket.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "ticket-1",
        status: SupportTicketStatus.RESOLVED,
      });

      await expect(
        addMessage({
          ticketId: "ticket-1",
          authorId: "user-1",
          authorRole: "user",
          body: "Pesan tambahan",
        }),
      ).rejects.toThrow("Tidak bisa membalas tiket yang sudah selesai.");
    });

    it("rejects asset IDs not uploaded by the message author", async () => {
      (
        prisma.supportTicket.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "ticket-1",
        status: SupportTicketStatus.OPEN,
      });
      (
        prisma.supportMessage.create as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "msg-2",
      });
      (
        prisma.supportAsset.updateMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ count: 0 });
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (callback: (tx: unknown) => unknown) => callback(prisma),
      );

      await expect(
        addMessage({
          ticketId: "ticket-1",
          authorId: "user-1",
          authorRole: "user",
          body: "Pesan tambahan",
          assetIds: ["foreign.png"],
        }),
      ).rejects.toThrow("Lampiran tidak valid.");
    });

    it("creates support message and bumps ticket updatedAt", async () => {
      (
        prisma.supportTicket.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "ticket-1",
        status: SupportTicketStatus.OPEN,
      });
      (
        prisma.supportMessage.create as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "msg-2",
      });
      (
        prisma.supportAsset.updateMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ count: 1 });

      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (callback: (tx: unknown) => unknown) => callback(prisma),
      );

      const result = await addMessage({
        ticketId: "ticket-1",
        authorId: "user-1",
        authorRole: "user",
        body: "Pesan tambahan",
      });

      expect(result).toEqual({ messageId: "msg-2" });
      expect(prisma.supportMessage.create).toHaveBeenCalledWith({
        data: {
          ticketId: "ticket-1",
          authorId: "user-1",
          authorRole: "user",
          body: "Pesan tambahan",
          assetIds: [],
        },
      });
      expect(prisma.supportTicket.update).toHaveBeenCalledWith({
        where: { id: "ticket-1" },
        data: { updatedAt: expect.any(Date) },
      });
    });
  });

  describe("resolveTicket", () => {
    it("allows admin to resolve at any time", async () => {
      (
        prisma.supportTicket.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "ticket-1",
        status: SupportTicketStatus.OPEN,
      });

      const result = await resolveTicket("ticket-1", "admin-1", true);

      expect(result.success).toBe(true);
      expect(prisma.supportTicket.update).toHaveBeenCalledWith({
        where: { id: "ticket-1" },
        data: {
          status: SupportTicketStatus.RESOLVED,
          resolvedAt: expect.any(Date),
          resolvedBy: "admin-1",
        },
      });
    });

    it("allows user to resolve only if status=OPEN and last message is from user", async () => {
      (
        prisma.supportTicket.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "ticket-1",
        userId: "user-1",
        status: SupportTicketStatus.OPEN,
      });
      (
        prisma.supportMessage.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        authorRole: "user",
      });

      const result = await resolveTicket("ticket-1", "user-1", false);

      expect(result.success).toBe(true);
      expect(prisma.supportTicket.update).toHaveBeenCalledWith({
        where: { id: "ticket-1" },
        data: {
          status: SupportTicketStatus.RESOLVED,
          resolvedAt: expect.any(Date),
          resolvedBy: null,
        },
      });
    });

    it("rejects user resolve if last message was from admin", async () => {
      (
        prisma.supportTicket.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "ticket-1",
        userId: "user-1",
        status: SupportTicketStatus.OPEN,
      });
      (
        prisma.supportMessage.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        authorRole: "admin",
      });

      await expect(resolveTicket("ticket-1", "user-1", false)).rejects.toThrow(
        "Hanya bisa menutup tiket setelah Anda mengirim pesan terakhir.",
      );
    });
  });

  describe("getUnreadCounts", () => {
    it("returns open count for user", async () => {
      (
        prisma.supportTicket.count as ReturnType<typeof vi.fn>
      ).mockResolvedValue(5);

      const result = await getUnreadCounts({
        userId: "user-1",
        isAdmin: false,
      });
      expect(result.userUnreadCount).toBe(5);
      expect(prisma.supportTicket.count).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          status: SupportTicketStatus.OPEN,
        },
      });
    });

    it("returns open with latest user message count for admin", async () => {
      (
        prisma.supportTicket.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { id: "ticket-1", messages: [{ authorRole: "user" }] },
        { id: "ticket-2", messages: [{ authorRole: "admin" }] },
      ]);

      const result = await getUnreadCounts({
        userId: "admin-1",
        isAdmin: true,
      });
      expect(result.adminUnreadCount).toBe(1);
    });
  });
});

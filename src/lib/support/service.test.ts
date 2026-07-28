import { SupportCategory, SupportTicketStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => {
  return {
    prismaMock: {
      supportTicket: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
        findMany: vi.fn(),
      },
      supportMessage: {
        create: vi.fn(),
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

// Now import the service after mocking prisma
import {
  createTicket,
  addMessage,
  resolveTicket,
  getUnreadCounts,
} from "@/lib/support/service";

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
      prismaMock.$transaction.mockImplementation(async (callback) => {
        return callback(prismaMock);
      });

      prismaMock.supportTicket.create.mockResolvedValue({
        id: "ticket-1",
      });

      prismaMock.supportMessage.create.mockResolvedValue({
        id: "message-1",
      });

      const result = await createTicket({
        userId: "user-1",
        subject: "Masalah",
        category: SupportCategory.TEKNIS,
        body: "Pesan pertama",
        assetIds: ["img-1"],
      });

      expect(result).toEqual({
        ticketId: "ticket-1",
        firstMessageId: "message-1",
      });
      expect(prismaMock.supportTicket.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          subject: "Masalah",
          category: SupportCategory.TEKNIS,
          status: SupportTicketStatus.OPEN,
        },
      });
      expect(prismaMock.supportMessage.create).toHaveBeenCalledWith({
        data: {
          ticketId: "ticket-1",
          authorId: "user-1",
          authorRole: "user",
          body: "Pesan pertama",
          assetIds: ["img-1"],
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
      prismaMock.supportTicket.findUnique.mockResolvedValue({
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

    it("creates support message and bumps ticket updatedAt", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue({
        id: "ticket-1",
        status: SupportTicketStatus.OPEN,
      });
      prismaMock.supportMessage.create.mockResolvedValue({
        id: "msg-2",
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        return callback(prismaMock);
      });

      const result = await addMessage({
        ticketId: "ticket-1",
        authorId: "user-1",
        authorRole: "user",
        body: "Pesan tambahan",
      });

      expect(result).toEqual({ messageId: "msg-2" });
      expect(prismaMock.supportMessage.create).toHaveBeenCalledWith({
        data: {
          ticketId: "ticket-1",
          authorId: "user-1",
          authorRole: "user",
          body: "Pesan tambahan",
          assetIds: [],
        },
      });
      expect(prismaMock.supportTicket.update).toHaveBeenCalledWith({
        where: { id: "ticket-1" },
        data: { updatedAt: expect.any(Date) },
      });
    });
  });

  describe("resolveTicket", () => {
    it("allows admin to resolve at any time", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue({
        id: "ticket-1",
        status: SupportTicketStatus.OPEN,
      });

      const result = await resolveTicket("ticket-1", "admin-1", true);

      expect(result.success).toBe(true);
      expect(prismaMock.supportTicket.update).toHaveBeenCalledWith({
        where: { id: "ticket-1" },
        data: {
          status: SupportTicketStatus.RESOLVED,
          resolvedAt: expect.any(Date),
          resolvedBy: "admin-1",
        },
      });
    });

    it("allows user to resolve only if status=OPEN and last message is from user", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue({
        id: "ticket-1",
        userId: "user-1",
        status: SupportTicketStatus.OPEN,
      });
      // Last message is user
      prismaMock.supportMessage.findFirst.mockResolvedValue({
        authorRole: "user",
      });

      const result = await resolveTicket("ticket-1", "user-1", false);

      expect(result.success).toBe(true);
      expect(prismaMock.supportTicket.update).toHaveBeenCalledWith({
        where: { id: "ticket-1" },
        data: {
          status: SupportTicketStatus.RESOLVED,
          resolvedAt: expect.any(Date),
          resolvedBy: null,
        },
      });
    });

    it("rejects user resolve if last message was from admin", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue({
        id: "ticket-1",
        userId: "user-1",
        status: SupportTicketStatus.OPEN,
      });
      // Last message is admin
      prismaMock.supportMessage.findFirst.mockResolvedValue({
        authorRole: "admin",
      });

      await expect(resolveTicket("ticket-1", "user-1", false)).rejects.toThrow(
        "Hanya bisa menutup tiket setelah Anda mengirim pesan terakhir.",
      );
    });
  });

  describe("getUnreadCounts", () => {
    it("returns open count for user", async () => {
      prismaMock.supportTicket.count.mockResolvedValue(5);

      const result = await getUnreadCounts({
        userId: "user-1",
        isAdmin: false,
      });
      expect(result.userUnreadCount).toBe(5);
      expect(prismaMock.supportTicket.count).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          status: SupportTicketStatus.OPEN,
        },
      });
    });

    it("returns open with latest user message count for admin", async () => {
      prismaMock.supportTicket.findMany.mockResolvedValue([
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

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  addMessageMock,
  authMock,
  supportMessageUpdateManyMock,
  supportTicketFindUniqueMock,
  userFindUniqueMock,
} = vi.hoisted(() => ({
  addMessageMock: vi.fn(),
  authMock: vi.fn(),
  supportMessageUpdateManyMock: vi.fn(),
  supportTicketFindUniqueMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportMessage: { updateMany: supportMessageUpdateManyMock },
    supportTicket: { findUnique: supportTicketFindUniqueMock },
    user: { findUnique: userFindUniqueMock },
  },
}));
vi.mock("@/lib/support/service", () => ({
  addMessage: addMessageMock,
  invalidateUnreadCache: vi.fn(),
}));

import { getHandler } from "../../tests/support/route-handler";

import { Route } from "@/routes/api.support.tickets.$ticketId";

const GET = getHandler(Route, "GET");
const POST = getHandler(Route, "POST");

describe("support ticket detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: { email: "owner@example.test", id: "user_1" },
    });
    supportMessageUpdateManyMock.mockResolvedValue({ count: 1 });
    userFindUniqueMock.mockResolvedValue({ email: "owner@example.test" });
  });

  it("checks ticket ownership before marking another user's messages read", async () => {
    supportTicketFindUniqueMock.mockResolvedValue({ userId: "user_2" });

    const response = await GET(
      new Request("http://localhost/api/support/tickets/ticket_1"),
      { ticketId: "ticket_1" },
    );

    expect(response.status).toBe(403);
    expect(supportMessageUpdateManyMock).not.toHaveBeenCalled();
    expect(supportTicketFindUniqueMock).toHaveBeenCalledWith({
      select: { userId: true },
      where: { id: "ticket_1" },
    });
  });

  it("does not let an admin use the owner reply endpoint for another user's ticket", async () => {
    authMock.mockResolvedValue({
      user: { admin: true, email: "admin@example.test", id: "admin_1" },
    });
    supportTicketFindUniqueMock.mockResolvedValue({ userId: "user_2" });

    const response = await POST(
      new Request("http://localhost/api/support/tickets/ticket_1", {
        body: JSON.stringify({ body: "Pesan admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      { ticketId: "ticket_1" },
    );

    expect(response.status).toBe(403);
    expect(addMessageMock).not.toHaveBeenCalled();
  });
});

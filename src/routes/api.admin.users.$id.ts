import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth/auth-admin";
import {
  sendBannedNotification,
  sendUnbannedNotification,
} from "@/lib/email/templates";
import { grantAdminEnergy } from "@/lib/payment/user-credits";
import { prisma } from "@/lib/prisma";

export type AdminActionParseError = { ok: false; message: string };
export type AdminEnergyGrantParseOk = { ok: true; amount: number };

function parseGrantArgs(body: unknown): number | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const obj = body as Record<string, unknown>;
  const raw = obj.amount;
  if (typeof raw !== "number" || Number.isNaN(raw)) {
    return null;
  }
  const n = Math.floor(raw);
  if (raw !== n || n < 1 || n > 2_000_000) {
    return null;
  }
  return n;
}

export function parseAdminEnergyGrant(
  body: unknown,
): AdminActionParseError | AdminEnergyGrantParseOk {
  const amount = parseGrantArgs(body);
  if (amount === null) {
    return {
      ok: false,
      message: "amount harus bilangan bulat antara 1 dan 2.000.000.",
    };
  }
  return { ok: true, amount };
}

export const Route = createFileRoute("/api/admin/users/$id")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }
        const action = new URL(request.url).searchParams.get("action");
        const id = params.id;
        if (action === "ban") {
          const user = await prisma.user.findUnique({
            where: { id },
            select: { email: true, name: true },
          });
          await prisma.user.update({
            where: { id },
            data: { bannedAt: new Date() },
          });
          const deployments = await prisma.projectDeployment.findMany({
            where: { kind: "published", project: { userId: id } },
            select: { id: true },
          });
          if (deployments.length > 0) {
            const { getRuntimeSupervisor } =
              await import("@/lib/projects/runtime-supervisor");
            const supervisor = getRuntimeSupervisor();
            await Promise.all(
              deployments.map((deployment) =>
                supervisor.stopDeployment(deployment.id).catch(() => undefined),
              ),
            );
          }
          // Non-fatal email
          if (user?.email) {
            sendBannedNotification(user.email, user.name ?? undefined).catch(
              () => undefined,
            );
          }
          return Response.json({ status: "banned" });
        }
        if (action === "unban") {
          const user = await prisma.user.findUnique({
            where: { id },
            select: { email: true, name: true },
          });
          await prisma.user.update({
            where: { id },
            data: { bannedAt: null },
          });
          // Non-fatal email
          if (user?.email) {
            sendUnbannedNotification(user.email, user.name ?? undefined).catch(
              () => undefined,
            );
          }
          return Response.json({ status: "unbanned" });
        }
        if (action === "grant-energy") {
          try {
            const body = (await request.json()) as unknown;
            const parse = parseAdminEnergyGrant(body);
            if (!parse.ok) {
              return Response.json({ message: parse.message }, { status: 400 });
            }
            await grantAdminEnergy(id, parse.amount);
            return Response.json({ granted: parse.amount });
          } catch {
            return Response.json(
              { message: "Internal server error." },
              { status: 500 },
            );
          }
        }
        return Response.json(
          { message: "action harus ban, unban, atau grant-energy." },
          { status: 400 },
        );
      },
    },
  },
});

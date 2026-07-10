import { assertDatabaseReady } from "@/lib/readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await assertDatabaseReady();

    return Response.json(
      { checks: { database: "ok" }, status: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { checks: { database: "unavailable" }, status: "not_ready" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "3" },
      },
    );
  }
}

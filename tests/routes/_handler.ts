import type { createFileRoute } from "@tanstack/react-router";

// Test helper: pull a method handler out of a TanStack server route so existing
// handler tests can invoke it directly the way they used to call the exported
// Next.js route function. Usage:
//   const GET = getHandler(Route, "GET");
//   const res = await GET(new Request(url), { id: "123" });
type AnyRoute = ReturnType<ReturnType<typeof createFileRoute>>;

type HandlerFn = (ctx: {
  request: Request;
  params: Record<string, string | undefined>;
}) => Response | Promise<Response>;

export function getHandler(route: AnyRoute, method: string) {
  const handlers = (
    route as unknown as {
      options?: {
        server?: {
          handlers?: Record<
            string,
            HandlerFn | { handler: HandlerFn } | undefined
          >;
        };
      };
    }
  ).options?.server?.handlers;

  const entry = handlers?.[method];
  const handler = typeof entry === "function" ? entry : entry?.handler;

  if (!handler) {
    throw new Error(`Route has no ${method} handler`);
  }

  return (request?: Request, params: Record<string, string | undefined> = {}) =>
    handler({ request: request ?? new Request("http://localhost/"), params });
}

// Test helper: pull a method handler out of a TanStack server route so existing
// handler tests can invoke it directly the way they used to call the exported
// Next.js route function. Usage:
//   const GET = getHandler(Route, "GET");
//   const res = await GET(new Request(url), { id: "123" });
type HandlerFn = (ctx: {
  request: Request;
  params: Record<string, string | undefined>;
}) => Response | Promise<Response>;

export function getHandler(route: unknown, method: string) {
  const handlers = (
    route as {
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

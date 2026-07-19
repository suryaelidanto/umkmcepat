import { Auth, createActionURL } from "@auth/core";
import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";

import { auth } from "@/lib/auth";
import { authConfig } from "@/lib/auth-config";

export const Route = createFileRoute("/api/debug/auth")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const reqFromStart = getRequest();

        let resultOnlyCookie = null;
        let resultAllHeaders = null;
        let actionUrl: string | URL = "";

        if (reqFromStart) {
          const forwardedProto = reqFromStart.headers.get("x-forwarded-proto");
          const proto =
            forwardedProto === "https" || forwardedProto === "http"
              ? forwardedProto
              : new URL(reqFromStart.url).protocol.replace(":", "");

          actionUrl = createActionURL(
            "session",
            proto,
            reqFromStart.headers,
            process.env,
            authConfig.basePath,
          );

          // 1) Test with ONLY cookie header (current behavior)
          try {
            const resp1 = await Auth(
              new Request(actionUrl.toString(), {
                headers: { cookie: reqFromStart.headers.get("cookie") ?? "" },
              }),
              authConfig,
            );
            resultOnlyCookie = {
              status: resp1.status,
              body: await resp1.json(),
            };
          } catch (e: unknown) {
            resultOnlyCookie = {
              error: e instanceof Error ? e.message : String(e),
            };
          }

          // 2) Test with ALL headers forwarded
          try {
            const resp2 = await Auth(
              new Request(actionUrl.toString(), {
                headers: reqFromStart.headers,
              }),
              authConfig,
            );
            resultAllHeaders = {
              status: resp2.status,
              body: await resp2.json(),
            };
          } catch (e: unknown) {
            resultAllHeaders = {
              error: e instanceof Error ? e.message : String(e),
            };
          }
        }

        const session = await auth();

        return Response.json({
          originalRequestUrl: request.url,
          reqFromStartUrl: reqFromStart?.url ?? null,
          actionUrl,
          headers: [...(reqFromStart?.headers.entries() ?? [])],
          session,
          resultOnlyCookie,
          resultAllHeaders,
        });
      },
    },
  },
});

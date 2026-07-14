# TanStack Start Route/Page Port Spec (agent contract)

The foundation is built and the production build is green. Your job: port Next.js
route handlers / pages to TanStack Start file routes following these EXACT patterns.
Do not invent new patterns. Do not touch files outside your assigned set.

## Golden rules

1. New routes live in `src/routes/`. Do NOT create or edit anything in `src/app/`
   (that tree is deleted at the end by the lead — leave it alone).
2. Route handler BODIES are already Web-standard (Request/Response/ReadableStream).
   Copy the body VERBATIM. Only change the signature wrapper and how `params` is obtained.
3. Never change anything in `src/lib/**` except where a task explicitly says so.
4. Preserve every behavior: status codes, headers, error messages, streaming,
   ownership checks, energy/rate-limit checks. This is a mechanical port, not a rewrite.
5. `import { auth } from "@/lib/auth"` still works and `await auth()` takes NO args
   (it reads the request from server context). Keep all `await auth()` calls as-is.

## File naming (Next path -> TanStack file)

- `src/app/api/foo/route.ts` -> `src/routes/api.foo.ts`
- `src/app/api/foo/bar/route.ts` -> `src/routes/api.foo.bar.ts`
- `src/app/api/projects/[id]/chat/route.ts` -> `src/routes/api.projects.$id.chat.ts`
- `src/app/api/projects/[id]/assets/[[...path]]/route.ts` -> `src/routes/api.projects.$id.assets.$.ts`
- Dynamic `[id]` -> `$id`; catch-all `[[...path]]` or `[...x]` -> `$` (splat).
- Splat param is read as `params._splat` (a string like "a/b/c", may be undefined).
  The old code did `const { path = [] } = await params` where path was string[].
  Convert: `const _splat = params._splat ?? ""; const path = _splat ? _splat.split("/") : [];`

## Server route template

Next:

```ts
export const runtime = "nodejs"; // DROP this line
export async function GET(request: Request, { params }: RouteProps) {
  const { id } = await params;
  // ...body...
  return Response.json(data);
}
```

TanStack (`src/routes/api.projects.$id.foo.ts`):

```ts
import { createFileRoute } from "@tanstack/react-router";
// ...copy all the SAME imports the original route used...

export const Route = createFileRoute("/api/projects/$id/foo")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { id } = params; // NO await — already resolved
        // ...body copied verbatim...
        return Response.json(data);
      },
    },
  },
});
```

Notes:

- Multiple methods (GET+POST): add each key under `handlers`.
- A handler with no request/params use: `GET: async () => { ... }`.
- Keep `import { NextResponse } ...` OUT — replace any `NextResponse.json(x, init)`
  with `Response.json(x, init)` (identical signature). Replace `NextResponse.json(x)`
  with `Response.json(x)`. `new NextResponse(body, init)` -> `new Response(body, init)`.
- Drop `export const runtime`/`export const dynamic` lines entirely.
- `createFileRoute("/api/...")` path uses `$id`/`$` segments exactly matching the filename.

## Page route template

Next server component page (`src/app/(main)/profile/page.tsx`):

```tsx
import { auth } from "@/lib/auth";
export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const data = await prisma...;
  return <ProfileView data={data} />;
}
```

TanStack file route (`src/routes/profile.tsx`) — use a loader + component:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { auth } from "@/lib/auth";

const loadProfile = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    throw redirect({ to: "/" });
  }
  const data = await prisma...; // same query as before
  return { data };
});

export const Route = createFileRoute("/profile")({
  loader: () => loadProfile(),
  component: ProfilePage,
  head: () => ({ meta: [{ title: "..." }] }), // if the page had metadata
});

function ProfilePage() {
  const { data } = Route.useLoaderData();
  return <ProfileView data={data} />;
}
```

Rules for pages:

- `redirect("/x")` (next/navigation) -> `throw redirect({ to: "/x" })` (from @tanstack/react-router).
- `notFound()` -> `throw notFound()` (import from @tanstack/react-router).
- Route groups `(main)` are NOT path segments. The `(main)` layout wrapping
  (MainChrome) is applied via a pathless layout route `src/routes/_main.tsx`
  (the lead handles the layout route; individual pages just render their content,
  OR are placed as children — the lead will tell you the exact parent).
- All DB access / auth MUST be inside a `createServerFn` handler (server-only),
  never in the component body (component runs on client too).
- Prefer keeping the existing presentational JSX identical.

## Client component template (next primitives -> shims)

Swap imports ONLY; keep component logic identical:

- `import Link from "next/link"` -> `import { Link } from "@/components/ui/link"`
- `import Image from "next/image"` -> `import { Image } from "@/components/ui/image"`
- `import { usePathname, useRouter } from "next/navigation"` -> `import { usePathname, useRouter } from "@/lib/navigation"`
- `import { useSession, signOut, signIn } from "next-auth/react"` -> `import { useSession, signOut, signIn } from "@/lib/auth-client"`
- Remove any `"use client";` directive (no-op in TanStack; keep file working).
  Actually: LEAVE "use client" in place — it is harmless and avoids churn. Do NOT
  add it where missing. (Vite ignores it.)
- `<Link href="/x">` keeps working via the shim (href prop preserved).
- `<Image src alt width height priority fill className>` keeps working via the shim.
- `router.push("/x")`, `router.replace("/x")`, `usePathname()` keep working via the shim.

## Verify before done

- `bunx tsc --noEmit` has no NEW errors in files you touched.
- No remaining `next/*` or `next-auth` imports in files you ported.
- Filenames match the `$id`/`$` convention and the `createFileRoute("...")` path string matches.

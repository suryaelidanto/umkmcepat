import { setEnvDefaults } from "@auth/core";
import Google from "@auth/core/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";

import type { AuthConfig } from "@auth/core";

import { prisma } from "@/lib/prisma";
import { getDiceBearAvatarUrl } from "@/lib/profile";
import { linkApprovedWaitlistOnSignup } from "@/lib/waitlist";

const googleConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

// Shared Auth.js Core config. Mirrors the previous NextAuth v5 setup exactly:
// Google provider, Prisma adapter, JWT sessions, and the same session/jwt
// callbacks. JWT encryption (salt + secret derivation) is identical to
// next-auth v5, so session cookies issued before the migration stay valid.
export const authConfig: AuthConfig = {
  basePath: "/api/auth",
  adapter: PrismaAdapter(prisma),
  providers: googleConfigured
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      ]
    : [],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }

      if (typeof token.name === "string" && session.user) {
        session.user.name = token.name;
      }

      if (typeof token.picture === "string" && session.user) {
        session.user.image = token.picture;
      }

      return session;
    },
    async jwt({ token, trigger, session, user }) {
      if (user) {
        token.sub = user.id;
        token.name = user.name;
        token.picture = getDiceBearAvatarUrl(user.name || "default");
      }

      if (trigger === "update") {
        const name = getSessionUpdateName(session);

        if (name) {
          token.name = name;
          token.picture = getDiceBearAvatarUrl(name);
        }
      }

      return token;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  // When a user links an OAuth account (first sign-in), connect them to any
  // approved pilot waitlist entry whose email matches, so the waitlist gate
  // lets approved applicants through. Best-effort; never blocks sign-in.
  events: {
    async linkAccount({ user }) {
      if (user?.id && user?.email) {
        await linkApprovedWaitlistOnSignup(user.id, user.email).catch(
          () => undefined,
        );
      }
    },
  },
  // The control plane sits behind a TLS-terminating proxy in production; trust
  // the forwarded host so OAuth callback URLs resolve to the public origin.
  trustHost: true,
};

// Populate AUTH_SECRET/host env defaults the way the framework integrations do,
// so a single NEXTAUTH_SECRET keeps working without renaming env vars.
setEnvDefaults(process.env, authConfig);

function getSessionUpdateName(value: unknown) {
  if (!value || typeof value !== "object") {
    return "";
  }

  const input = value as { name?: unknown; user?: { name?: unknown } };
  const name =
    typeof input.name === "string"
      ? input.name
      : typeof input.user?.name === "string"
        ? input.user.name
        : "";

  return name.trim().replace(/\s+/g, " ").slice(0, 100);
}

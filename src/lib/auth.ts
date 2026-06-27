import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { prisma } from "@/lib/prisma";
import { toPublicProfileImage } from "@/lib/profile";

const googleConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

export const { handlers, auth, signIn, signOut } = NextAuth({
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
        token.picture = toPublicProfileImage(user.image);
      }

      if (trigger === "update") {
        const name = getSessionUpdateName(session);

        if (name) {
          token.name = name;
        }

        const image = getSessionUpdateImage(session);

        if (image) {
          token.picture = image;
        }
      }

      return token;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});

function getSessionUpdateImage(value: unknown) {
  if (!value || typeof value !== "object") {
    return "";
  }

  const input = value as { image?: unknown; user?: { image?: unknown } };
  const image =
    typeof input.image === "string"
      ? input.image
      : typeof input.user?.image === "string"
        ? input.user.image
        : "";

  return toPublicProfileImage(image);
}

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

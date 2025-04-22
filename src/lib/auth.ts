import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Google from "next-auth/providers/google"
import { prisma } from "@/lib/prisma"

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error("Missing Google OAuth environment variables");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Optional: Request profile and email scopes
      // authorization: {
      //   params: {
      //     prompt: "consent",
      //     access_type: "offline",
      //     response_type: "code",
      //   },
      // },
    }),
  ],
  // Optional: Add custom pages if needed
  // pages: {
  //   signIn: '/auth/signin',
  //   // signOut: '/auth/signout',
  //   // error: '/auth/error', // Error code passed in query string as ?error=
  //   // verifyRequest: '/auth/verify-request', // (used for email/passwordless login)
  //   // newUser: '/auth/new-user' // New users will be directed here on first sign in (leave the property out to disable)
  // },
  session: {
    strategy: "jwt", // Using JWT for session strategy is recommended
  },
  callbacks: {
    // Include user ID and potentially other fields in the session and JWT
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
        // You could add other token properties to the session here if needed
      }
      return session;
    },
    async jwt({ token, user }) {
      // On sign in, add user ID to the token
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
  // Optional: Enable debug messages in development
  // debug: process.env.NODE_ENV === 'development',
  secret: process.env.NEXTAUTH_SECRET, // Ensure NEXTAUTH_SECRET is set
}); 
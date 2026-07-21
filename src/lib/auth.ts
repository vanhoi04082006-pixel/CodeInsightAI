import { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { db } from "@/lib/db";

/**
 * NextAuth — GitHub only (SaaS mode)
 *
 * Users MUST sign in with GitHub to use the app.
 * Landing page is public, but app requires authentication.
 */
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID as string,
      clientSecret: process.env.GITHUB_SECRET as string,
      authorization: { params: { scope: "read:user user:email repo" } },
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.provider = account.provider;
      }
      // Attach user plan to token for quick access
      if (token.sub) {
        try {
          const user = await db.user.findUnique({
            where: { id: token.sub },
            select: { plan: true, stripeCustomerId: true },
          });
          if (user) {
            token.plan = user.plan;
            token.stripeCustomerId = user.stripeCustomerId;
          }
        } catch {
          // DB might not be ready — ignore
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Attach user info to session
      if (session.user) {
        (session as any).accessToken = token.accessToken;
        (session as any).provider = token.provider;
        (session as any).plan = token.plan ?? "free";
        (session as any).stripeCustomerId = token.stripeCustomerId;
      }
      // Try to load connected providers
      if (session.user && token.sub) {
        try {
          const accounts = await db.account.findMany({
            where: { userId: token.sub },
            select: { provider: true },
          });
          (session as any).providers = accounts.map(a => a.provider);
        } catch {
          (session as any).providers = [];
        }
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/",
    error: "/",
  },
};

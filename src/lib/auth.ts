import { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { db } from "@/lib/db";

/**
 * NextAuth — GitHub only (production-grade SaaS auth)
 *
 * - JWT strategy (stateless, scales on Vercel serverless)
 * - session.user.id is populated from token.sub (the User.id cuid)
 * - All API routes MUST read session.user.id — never use email as userId
 *   (email is for display only; User.id is the FK target in Prisma)
 *
 * Required env vars:
 *   NEXTAUTH_SECRET  — random 32+ char string
 *   NEXTAUTH_URL     — app origin (http://localhost:3000 locally,
 *                      https://code-insight-ai-six.vercel.app in prod)
 *   GITHUB_ID        — GitHub OAuth App Client ID
 *   GITHUB_SECRET    — GitHub OAuth App Client Secret
 *
 * GitHub OAuth callback URL (set in https://github.com/settings/developers):
 *   <NEXTAUTH_URL>/api/auth/callback/github
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
    // JWT is stateless and works on Vercel serverless without a session table
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account, user }) {
      // On first sign-in: persist the OAuth access_token + provider name
      if (account) {
        token.accessToken = account.access_token;
        token.provider = account.provider;
      }
      // On first sign-in (user object present): capture user.id into token.sub
      // (NextAuth already sets token.sub = user.id, but we be explicit)
      if (user?.id) {
        token.uid = user.id;
      }
      // Attach user plan + stripe customer id (re-queried each JWT refresh so
      // the session reflects plan changes from Stripe webhook immediately)
      const uid = (token.uid as string | undefined) ?? token.sub;
      if (uid) {
        try {
          const dbUser = await db.user.findUnique({
            where: { id: uid },
            select: { plan: true, stripeCustomerId: true, name: true, email: true, image: true },
          });
          if (dbUser) {
            token.plan = dbUser.plan;
            token.stripeCustomerId = dbUser.stripeCustomerId;
            // Make sure display fields stay in sync with DB
            token.name = dbUser.name ?? token.name;
            token.email = dbUser.email ?? token.email;
            token.picture = dbUser.image ?? token.picture;
          }
        } catch {
          // DB might not be ready during initial db:push — ignore gracefully
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Populate session.user.id — this is the canonical user identifier
      // and is used by ALL authenticated API routes as the Prisma userId FK.
      if (session.user) {
        const uid = (token.uid as string | undefined) ?? token.sub;
        // NextAuth v4 type augmentation doesn't include id by default; assign it
        (session.user as any).id = uid;
        (session as any).accessToken = token.accessToken;
        (session as any).provider = token.provider;
        (session as any).plan = token.plan ?? "free";
        (session as any).stripeCustomerId = token.stripeCustomerId;
      }
      // Load connected OAuth providers for the account-settings UI
      const uid = (token.uid as string | undefined) ?? token.sub;
      if (session.user && uid) {
        try {
          const accounts = await db.account.findMany({
            where: { userId: uid },
            select: { provider: true },
          });
          (session as any).providers = accounts.map((a) => a.provider);
        } catch {
          (session as any).providers = [];
        }
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    // Landing page IS the sign-in page — it shows the public marketing view
    // and the login screen is overlaid when the user tries to access the app.
    signIn: "/",
    error: "/",
  },
  // Defensive: surface OAuth errors via ?error= on the redirect back to "/"
  // so the client can toast them (see settings-view.tsx / login-screen.tsx).
  debug: process.env.NODE_ENV === "development" && process.env.AUTH_DEBUG === "1",
};

/**
 * Helper for API routes — returns the authenticated user's id (User.id cuid)
 * or null if unauthenticated. Use this instead of reading session.user.email
 * (email is for display only; id is the Prisma FK).
 *
 * Example:
 *   const userId = await requireUserId();
 *   if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   await db.providerCredential.findMany({ where: { userId } });
 */
export async function requireUserId(): Promise<string | null> {
  // Lazy import to avoid circular deps in route handlers
  const { getServerSession } = await import("next-auth");
  const session = await getServerSession(authOptions);
  const uid = (session?.user as any)?.id ?? (session as any)?.uid ?? null;
  return uid ?? null;
}

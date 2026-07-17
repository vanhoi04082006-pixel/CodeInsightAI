import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { db } from "@/lib/db";

const handler = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID as string,
      clientSecret: process.env.GITHUB_SECRET as string,
      authorization: { params: { scope: "read:user user:email repo" } },
      allowDangerousEmailAccountLinking: true, // Cho phép liên kết Github và Google nếu dùng chung 1 Email
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_ID as string,
      clientSecret: process.env.GOOGLE_SECRET as string,
      authorization: { params: { scope: "openid email profile" } },
      allowDangerousEmailAccountLinking: true, // Cho phép liên kết Github và Google nếu dùng chung 1 Email
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      // Tìm TẤT CẢ các tài khoản (Github, Google...) đã liên kết với User này trong Database
      if (session.user && token.sub) {
        const accounts = await db.account.findMany({
          where: { userId: token.sub },
          select: { provider: true },
        });
        // Trả về một mảng chứa tên các provider (VD: ["github", "google"])
        (session as any).providers = accounts.map(a => a.provider);
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/settings",
    error: "/settings",
  },
});

export { handler as GET, handler as POST };
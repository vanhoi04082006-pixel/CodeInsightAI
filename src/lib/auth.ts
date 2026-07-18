import { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { db } from "@/lib/db";

/**
 * NextAuth options — được tách ra file riêng để các Route Handler khác
 * (ví dụ /api/analyze) có thể gọi getServerSession(authOptions) để lấy
 * session và access token của người dùng hiện tại.
 *
 * QUAN TRỌNG: scope "repo" cho phép đọc repo private của GitHub.
 */
export const authOptions: NextAuthOptions = {
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
      // Lưu access_token lần đầu khi đăng nhập (và khi refresh có account mới)
      if (account) {
        token.accessToken = account.access_token;
        token.provider = account.provider;
      }
      return token;
    },
    async session({ session, token }) {
      // Tìm TẤT CẢ các tài khoản (Github, Google...) đã liên kết với User này trong Database.
      // Wrap trong try/catch: nếu user chưa chạy `bun run db:push` (schema chưa sync),
      // bảng Account có thể chưa tồn tại → không crash toàn bộ session, chỉ trả về providers rỗng.
      if (session.user && token.sub) {
        try {
          const accounts = await db.account.findMany({
            where: { userId: token.sub },
            select: { provider: true },
          });
          (session as any).providers = accounts.map(a => a.provider);
        } catch (err) {
          // Bảng Account chưa tồn tại hoặc DB chưa sẵn sàng — fallback an toàn.
          console.warn("[auth] session callback: could not query Account table (run `bun run db:push` to sync schema):", err instanceof Error ? err.message : String(err));
          (session as any).providers = [];
        }
      }
      // Expose accessToken lên session để các API route phía server dùng
      // gọi GitHub API (đặc biệt cho repo private).
      (session as any).accessToken = token.accessToken;
      (session as any).provider = token.provider;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/settings",
    error: "/settings",
  },
};

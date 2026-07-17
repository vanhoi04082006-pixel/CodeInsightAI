import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// Re-export handler dùng chung authOptions từ src/lib/auth.ts
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

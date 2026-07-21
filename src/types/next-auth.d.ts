// NextAuth type augmentation
// Adds `id` to session.user (so we can use session.user.id safely)
// Adds `plan`, `stripeCustomerId`, `accessToken`, `provider`, `providers`,
// `role`, `banned` to session.
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
    plan?: string;
    stripeCustomerId?: string | null;
    accessToken?: string;
    provider?: string;
    providers?: string[];
    role?: string;   // "user" | "admin"
    banned?: boolean;
  }

  interface User {
    id: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    plan?: string;
    stripeCustomerId?: string | null;
    accessToken?: string;
    provider?: string;
    role?: string;   // "user" | "admin"
    banned?: boolean;
  }
}

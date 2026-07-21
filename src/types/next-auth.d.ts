// NextAuth type augmentation
// Adds `id` to session.user (so we can use session.user.id safely)
// Adds `plan`, `stripeCustomerId`, `accessToken`, `provider`, `providers` to session.
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
  }
}

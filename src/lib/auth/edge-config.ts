import type { NextAuthConfig } from "next-auth";

// Edge-safe auth config (no Node.js APIs, no DB imports)
// Used only by middleware for JWT session reading
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.onboardingCompleted = (user as { onboardingCompleted?: boolean }).onboardingCompleted;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { onboardingCompleted?: boolean }).onboardingCompleted =
          token.onboardingCompleted as boolean;
      }
      return session;
    },
  },
  providers: [], // providers added in full config
};

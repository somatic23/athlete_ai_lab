import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "./edge-config";
import { logger } from "@/lib/utils/logger";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  events: {
    async signOut(message) {
      const token = "token" in message ? message.token : undefined;
      await logger.info("auth.logout", {
        userId: token?.id as string | undefined,
        metadata: { email: token?.email, displayName: token?.name },
      });
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      // On initial sign-in
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.onboardingCompleted = (user as { onboardingCompleted?: boolean }).onboardingCompleted;
      }
      // On session.update() call — refresh from DB
      if (trigger === "update" && token.id) {
        const fresh = await db.query.users.findFirst({
          where: eq(users.id, token.id as string),
          columns: { role: true, onboardingCompleted: true },
        });
        if (fresh) {
          token.role = fresh.role;
          token.onboardingCompleted = fresh.onboardingCompleted;
        }
      }
      return token;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await db.query.users.findFirst({
          where: eq(users.email, parsed.data.email),
        });
        if (!user) {
          await logger.warn("auth.login.failed", { metadata: { reason: "user_not_found", email: parsed.data.email } });
          return null;
        }

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash
        );
        if (!valid) {
          await logger.warn("auth.login.failed", { userId: user.id, metadata: { reason: "wrong_password", email: user.email, displayName: user.displayName } });
          return null;
        }

        await logger.info("auth.login.success", { userId: user.id, metadata: { email: user.email, displayName: user.displayName } });

        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          role: user.role,
          onboardingCompleted: user.onboardingCompleted,
        };
      },
    }),
  ],
});

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/edge-config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const { auth } = NextAuth(authConfig);

const publicPaths = ["/login", "/register"];
const adminPaths = ["/admin"];

export default auth((req: NextRequest & { auth?: { user?: { role?: string; onboardingCompleted?: boolean } } | null }) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));
  const isAdmin = adminPaths.some((p) => pathname.startsWith(p));
  const isApiAuth = pathname.startsWith("/api/auth");

  if (isApiAuth) return NextResponse.next();

  // Not logged in → redirect to login
  if (!session?.user && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Logged in + public page → redirect to app
  if (session?.user && isPublic) {
    const target = session.user.onboardingCompleted ? "/coach" : "/onboarding";
    return NextResponse.redirect(new URL(target, req.url));
  }

  // Logged in but onboarding not done
  if (
    session?.user &&
    !session.user.onboardingCompleted &&
    !pathname.startsWith("/onboarding") &&
    !isPublic
  ) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  // Admin only paths
  if (isAdmin && session?.user?.role !== "admin") {
    return NextResponse.redirect(new URL("/coach", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads).*)"],
};

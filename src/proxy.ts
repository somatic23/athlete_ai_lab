import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/edge-config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const { auth } = NextAuth(authConfig);

const publicPaths = ["/login", "/register"];
const adminPaths = ["/admin"];

function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
    ].join("; ")
  );
  return res;
}

export default auth((req: NextRequest & { auth?: { user?: { role?: string; onboardingCompleted?: boolean } } | null }) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));
  const isAdmin = adminPaths.some((p) => pathname.startsWith(p));
  const isApiAuth = pathname.startsWith("/api/auth");

  if (isApiAuth) return withSecurityHeaders(NextResponse.next());

  // Not logged in → redirect to login
  if (!session?.user && !isPublic) {
    return withSecurityHeaders(NextResponse.redirect(new URL("/login", req.url)));
  }

  // Logged in + public page → redirect to app
  if (session?.user && isPublic) {
    const target = session.user.onboardingCompleted ? "/coach" : "/onboarding";
    return withSecurityHeaders(NextResponse.redirect(new URL(target, req.url)));
  }

  // Logged in but onboarding not done
  // API routes must always pass through — the fetch would otherwise silently
  // follow the redirect and return 200 HTML instead of the expected JSON.
  if (
    session?.user &&
    !session.user.onboardingCompleted &&
    !pathname.startsWith("/onboarding") &&
    !pathname.startsWith("/api/") &&
    !isPublic
  ) {
    return withSecurityHeaders(NextResponse.redirect(new URL("/onboarding", req.url)));
  }

  // Admin only paths
  if (isAdmin && session?.user?.role !== "admin") {
    return withSecurityHeaders(NextResponse.redirect(new URL("/coach", req.url)));
  }

  return withSecurityHeaders(NextResponse.next());
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads).*)"],
};

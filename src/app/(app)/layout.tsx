"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils/cn";
import { useLocaleStore } from "@/stores/locale-store";
import { ErrorBoundary } from "@/components/ui/error-boundary";

const NAV_ITEMS = [
  { href: "/coach",           label: "AI Coach",      labelEn: "AI Coach",    icon: "◈" },
  { href: "/plans",           label: "Pläne",         labelEn: "Plans",       icon: "▦" },
  { href: "/calendar",        label: "Kalender",      labelEn: "Calendar",    icon: "▣" },
  { href: "/workout/history", label: "Training",      labelEn: "Workout",     icon: "◫" },
  { href: "/records",         label: "Bestleistungen",labelEn: "Records",     icon: "◆" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { locale, setLocale } = useLocaleStore();

  // Sync locale from user profile once on mount
  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p) => { if (p.preferredLocale) setLocale(p.preferredLocale); })
      .catch(() => {});
  }, [setLocale]);

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* ── Desktop Sidebar ───────────────────────────────────── */}
      <aside className="hidden w-56 shrink-0 flex-col bg-surface-container-low lg:flex">
        <div className="px-5 py-6">
          <span className="font-headline text-sm font-bold tracking-tight text-primary">
            ATHLETE AI LAB
          </span>
        </div>

        <nav className="flex-1 px-3">
          <ul className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const label = locale === "en" ? item.labelEn : item.label;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                      active
                        ? "bg-primary-container/20 text-primary"
                        : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                    )}
                  >
                    <span className="text-base leading-none">{item.icon}</span>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex flex-col gap-1 px-5 py-5 border-t border-outline-variant/10">
          <Link
            href="/settings"
            className={cn(
              "text-xs transition-colors py-1",
              pathname === "/settings" ? "text-primary" : "text-on-surface-variant hover:text-on-surface"
            )}
          >
            {locale === "en" ? "Settings" : "Einstellungen"}
          </Link>
          <button
            onClick={() => signOut({ redirectTo: "/login" })}
            className="text-left text-xs text-on-surface-variant/60 hover:text-error transition-colors py-1"
          >
            {locale === "en" ? "Sign out" : "Abmelden"}
          </button>
        </div>
      </aside>

      {/* ── Mobile top bar ────────────────────────────────────── */}
      <div className="fixed inset-x-0 top-0 z-10 flex items-center justify-between glass px-4 py-3 lg:hidden">
        <span className="font-headline text-sm font-bold text-primary tracking-tight">
          ATHLETE AI LAB
        </span>
        <Link
          href="/settings"
          className={cn(
            "text-xs transition-colors",
            pathname === "/settings" ? "text-primary" : "text-on-surface-variant"
          )}
          aria-label="Settings"
        >
          ⚙
        </Link>
      </div>

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile spacer for fixed top bar */}
        <div className="h-[52px] shrink-0 lg:hidden" />
        <div className="min-h-0 flex-1 overflow-hidden">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
        {/* Mobile spacer for bottom nav */}
        <div className="h-16 shrink-0 lg:hidden" />
      </main>

      {/* ── Mobile bottom navigation ──────────────────────────── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 glass lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <ul className="flex h-16 items-center justify-around px-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const label = locale === "en" ? item.labelEn : item.label;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg transition-all",
                    active ? "text-primary" : "text-on-surface-variant/60"
                  )}
                >
                  <span className={cn("text-lg leading-none transition-transform", active && "scale-110")}>
                    {item.icon}
                  </span>
                  <span className="text-[10px] font-medium truncate max-w-[52px] text-center leading-none">
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils/cn";
import { useLocaleStore } from "@/stores/locale-store";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { getPersonality } from "@/lib/coach-personalities";

// ── Nav items ─────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: "/dashboard",       label: "Home",          labelEn: "Home",        icon: "⊞" },
  { href: "/coach",           label: "AI Coach",      labelEn: "AI Coach",    icon: "◈" },
  { href: "/plans",           label: "Pläne",         labelEn: "Plans",       icon: "▦" },
  { href: "/calendar",        label: "Kalender",      labelEn: "Calendar",    icon: "▣" },
  { href: "/workout/history", label: "Training",      labelEn: "Workout",     icon: "◫" },
  { href: "/records",         label: "Bestleistungen",labelEn: "Records",     icon: "◆" },
];

// route → [section, page] breadcrumb labels
const CRUMBS: Record<string, [string, string]> = {
  "/dashboard":       ["Overview",    "Today"],
  "/coach":           ["Agents",      "Atlas"],
  "/plans":           ["Training",    "Plans"],
  "/calendar":        ["Training",    "Calendar"],
  "/workout/history": ["Session",     "History"],
  "/workout":         ["Session",     "Live"],
  "/records":         ["Performance", "Records"],
  "/settings":        ["Account",     "Settings"],
};

function getCrumbs(pathname: string): [string, string] {
  for (const [key, val] of Object.entries(CRUMBS)) {
    if (pathname === key || pathname.startsWith(key + "/")) return val;
  }
  return ["App", ""];
}

// ── Logo ──────────────────────────────────────────────────────────────

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-0.5 py-1">
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{
          background: "linear-gradient(135deg, #cafd00 0%, #beee00 50%, #00e3fd 140%)",
          boxShadow: "0 0 20px -2px rgba(202,253,0,0.45), inset 0 1px 0 rgba(255,255,255,0.35)",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#0e0e0e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 14 10 4l6 10M7 11h6" />
        </svg>
      </div>
      <div className="flex flex-col leading-none">
        <span className="font-headline text-[12.5px] font-bold tracking-[0.08em] text-on-surface">ATHLETE</span>
        <span className="mono-text text-[9.5px] tracking-[0.22em] text-primary-container" style={{ marginTop: 2 }}>AI · LAB</span>
      </div>
    </div>
  );
}

// ── Streak widget ─────────────────────────────────────────────────────

function StreakWidget({ streak }: { streak: number }) {
  if (streak === 0) return null;
  return (
    <div
      className="relative mx-2.5 mb-2.5 overflow-hidden rounded-xl px-3 py-2.5"
      style={{
        background: "linear-gradient(180deg, rgba(202,253,0,0.08), rgba(202,253,0,0.02))",
        border: "1px solid rgba(202,253,0,0.18)",
      }}
    >
      <div className="shine pointer-events-none absolute inset-0" />
      <div className="flex items-center gap-2">
        <span className="text-sm leading-none">🔥</span>
        <span className="caption text-primary-container">Streak</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="display-text text-2xl font-bold text-on-surface">{streak}</span>
        <span className="mono-text text-[10px] text-on-surface-variant/60">days</span>
      </div>
      <div className="mt-2 flex gap-0.5">
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className="flex-1 h-1.5 rounded-[2px]"
            style={{
              background: i < streak ? "var(--primary-container)" : "rgba(255,255,255,0.05)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── TopBar (desktop only) ─────────────────────────────────────────────

function TopBar({ pathname, coachName }: { pathname: string; coachName: string }) {
  const [dateTime, setDateTime] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setDateTime(
        now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
        + " · "
        + now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      );
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const crumbs = getCrumbs(pathname);
  const [section, page] = pathname === "/coach" ? [crumbs[0], coachName] : crumbs;

  return (
    <div
      className="hidden shrink-0 items-center gap-4 border-b border-outline-variant/10 px-7 py-3.5 lg:flex"
      style={{ background: "rgba(14,14,14,0.75)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mono-text text-[10.5px] tracking-[0.06em]">
        <span className="text-on-surface-variant/50">{section}</span>
        <span className="text-on-surface-variant/30">/</span>
        <span className="text-on-surface">{page}</span>
      </div>

      <div className="flex-1" />

      {/* COACH ONLINE */}
      <div
        className="flex items-center gap-2 rounded-full px-2.5 py-1 mono-text text-[10px] text-secondary"
        style={{ background: "rgba(0,227,253,0.07)", border: "1px solid rgba(0,227,253,0.18)" }}
      >
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-secondary" />
        COACH ONLINE
      </div>

      {/* Date + time */}
      <span className="mono-text text-[11px] text-on-surface-variant/50">{dateTime}</span>

      {/* Start Workout CTA */}
      <Link
        href="/workout/history"
        className="btn-liquid flex items-center gap-1.5 rounded-[9px] px-3.5 py-1.5 text-[12.5px] font-semibold text-on-primary"
      >
        ⚡ Start Workout
      </Link>
    </div>
  );
}

// ── App layout ────────────────────────────────────────────────────────

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, setLocale } = useLocaleStore();
  const [userMeta, setUserMeta] = useState<{
    displayName: string;
    avatarUrl: string | null;
    trainingStreak: number;
  } | null>(null);
  const [coachName, setCoachName] = useState("Atlas");

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p) => {
        if (p.preferredLocale) setLocale(p.preferredLocale);
        if (p.coachPersonality) setCoachName(getPersonality(p.coachPersonality).label);
        setUserMeta({
          displayName: p.displayName ?? "",
          avatarUrl: p.avatarUrl ?? null,
          trainingStreak: p.trainingStreak ?? 0,
        });
      })
      .catch(() => {});
  }, [setLocale]);

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* ── Desktop Sidebar ─────────────────────────────────────────── */}
      <aside className="hidden w-56 shrink-0 flex-col bg-surface-container-low lg:flex"
             style={{ borderRight: "1px solid rgba(72,72,71,0.15)" }}>
        {/* Logo */}
        <div className="px-4 py-5">
          <Logo />
        </div>

        {/* Streak widget */}
        <StreakWidget streak={userMeta?.trainingStreak ?? 0} />

        {/* Nav label */}
        <div className="px-4 pb-1">
          <span className="caption">Navigate</span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2.5">
          <ul className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const label = locale === "en" ? item.labelEn : item.label;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                      active
                        ? "text-primary-container"
                        : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                    )}
                    style={active ? { background: "rgba(202,253,0,0.09)" } : undefined}
                  >
                    <span className={cn("nav-tick", active && "nav-tick-active")} />
                    <span className="text-base leading-none">{item.icon}</span>
                    <span className="flex-1">{label}</span>
                    {active && (
                      <span className="mono-text text-[9px] opacity-60">↵</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ⌘K search */}
        <div className="px-3 py-2">
          <div
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-on-surface-variant/60 transition-colors hover:text-on-surface-variant"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(72,72,71,0.18)" }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="7" cy="7" r="5" /><path d="M12 12l2.5 2.5" />
            </svg>
            <span className="flex-1">Search…</span>
            <kbd className="mono-text rounded bg-surface-container-highest px-1 py-0.5 text-[9.5px] text-on-surface-variant">⌘K</kbd>
          </div>
        </div>

        {/* User footer */}
        <div className="border-t border-outline-variant/10 px-3 py-3">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 rounded-lg px-2 py-2 transition-all",
              pathname === "/settings"
                ? "bg-primary-container/10 text-primary-container"
                : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
            )}
          >
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-surface-container-high"
                 style={{ border: "1px solid rgba(72,72,71,0.25)" }}>
              {userMeta?.avatarUrl ? (
                <Image src={userMeta.avatarUrl} alt="" width={30} height={30} className="h-full w-full object-cover" unoptimized />
              ) : (
                <span className="display-text text-[13px] font-bold text-primary-container select-none">
                  {userMeta?.displayName?.[0]?.toUpperCase() ?? "?"}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold">{userMeta?.displayName ?? ""}</p>
              <p className="mono-text text-[9.5px] text-on-surface-variant/50">
                PRO · {locale === "en" ? "Settings" : "Einstellungen"}
              </p>
            </div>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10" cy="10" r="2.5" />
              <path d="M10 3.5v2M10 14.5v2M3.5 10h2M14.5 10h2M5.6 5.6l1.4 1.4M13 13l1.4 1.4M5.6 14.4l1.4-1.4M13 7l1.4-1.4" />
            </svg>
          </Link>
          <button
            onClick={() => signOut({ redirect: false }).then(() => router.push("/login"))}
            className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs text-on-surface-variant/50 transition-all hover:bg-error/5 hover:text-error"
          >
            {locale === "en" ? "Sign out" : "Abmelden"}
          </button>
        </div>
      </aside>

      {/* ── Mobile top bar ───────────────────────────────────────────── */}
      <div className="fixed inset-x-0 top-0 z-10 flex items-center justify-between glass px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <div
            className="flex h-6 w-6 items-center justify-center rounded-md"
            style={{ background: "linear-gradient(135deg, #cafd00 0%, #00e3fd 140%)" }}
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#0e0e0e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 14 10 4l6 10M7 11h6" />
            </svg>
          </div>
          <span className="font-headline text-sm font-bold tracking-tight text-primary">ATHLETE AI LAB</span>
        </div>
        <Link
          href="/settings"
          className={cn("text-xs transition-colors", pathname === "/settings" ? "text-primary" : "text-on-surface-variant")}
          aria-label="Settings"
        >
          ⚙
        </Link>
      </div>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar spacer */}
        <div className="h-[52px] shrink-0 lg:hidden" />
        {/* Desktop TopBar */}
        <TopBar pathname={pathname} coachName={coachName} />
        <div className="min-h-0 flex-1 overflow-hidden">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
        {/* Mobile bottom nav spacer */}
        <div className="h-16 shrink-0 lg:hidden" />
      </main>

      {/* ── Mobile bottom navigation ─────────────────────────────────── */}
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
                    "flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 transition-all",
                    active ? "text-primary" : "text-on-surface-variant/60"
                  )}
                >
                  <span className={cn("text-lg leading-none transition-transform", active && "scale-110")}>
                    {item.icon}
                  </span>
                  <span className="max-w-[52px] truncate text-center text-[10px] font-medium leading-none">
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

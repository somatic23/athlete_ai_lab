"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

const NAV_ITEMS = [
  { href: "/coach",           label: "AI Coach",        icon: "◈" },
  { href: "/plans",           label: "Trainingsplaene", icon: "▦" },
  { href: "/calendar",        label: "Kalender",         icon: "▣" },
  { href: "/workout/history", label: "Historie",         icon: "◫" },
  { href: "/records",         label: "Bestleistungen",   icon: "◆" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col bg-surface-container-low lg:flex">
        <div className="px-5 py-6">
          <span className="font-headline text-base font-bold tracking-tight text-primary">
            ATHLETE AI LAB
          </span>
        </div>

        <nav className="flex-1 px-3">
          <ul className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
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
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="px-5 py-5">
          <Link
            href="/settings"
            className="text-xs text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Einstellungen
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-10 flex items-center justify-between bg-surface/80 px-4 py-3 backdrop-blur-sm lg:hidden">
        <span className="font-headline text-sm font-bold text-primary">ATHLETE AI LAB</span>
      </div>

      {/* Main */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile spacer for fixed top bar */}
        <div className="h-12 shrink-0 lg:hidden" />
        <div className="min-h-0 flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}

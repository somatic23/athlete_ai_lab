import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

const navItems = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/users", label: "Benutzer" },
  { href: "/admin/equipment", label: "Equipment" },
  { href: "/admin/exercises", label: "Uebungen" },
  { href: "/admin/ai-config", label: "AI Provider" },
  { href: "/admin/logs", label: "Logfiles" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if ((session.user as { role?: string }).role !== "admin") redirect("/coach");

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Admin Sidebar */}
      <aside className="w-56 shrink-0 bg-surface-container-low flex flex-col">
        <div className="px-5 py-6 border-b border-outline-variant/10">
          <p className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
            Administration
          </p>
          <h1 className="mt-1 font-headline text-base font-bold text-primary">
            ATHLETE AI LAB
          </h1>
        </div>
        <nav className="flex-1 px-3 py-4">
          <ul className="flex flex-col gap-0.5">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex rounded-md px-3 py-2 text-sm font-medium transition-all",
                    "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="px-5 py-4 border-t border-outline-variant/10">
          <Link
            href="/coach"
            className="text-xs text-on-surface-variant hover:text-primary transition-colors"
          >
            &larr; Zur App
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}

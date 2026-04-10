import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Sidebar placeholder - built in Phase 2 */}
      <aside className="hidden w-64 shrink-0 border-r border-outline-variant/10 bg-surface-container-low lg:flex lg:flex-col">
        <div className="px-6 py-8">
          <h1 className="font-headline text-lg font-bold text-primary">
            ATHLETE AI LAB
          </h1>
        </div>
        <nav className="flex-1 px-4">
          <ul className="flex flex-col gap-1 text-sm">
            {[
              { href: "/coach", label: "AI Coach" },
              { href: "/plans", label: "Trainingsplaene" },
              { href: "/calendar", label: "Kalender" },
              { href: "/workout/history", label: "Historie" },
              { href: "/records", label: "Bestleistungen" },
            ].map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="flex rounded-md px-4 py-2.5 font-medium text-on-surface-variant transition-all hover:bg-surface-container hover:text-on-surface"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="px-4 py-4">
          <p className="text-xs text-on-surface-variant">
            {session.user.name}
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

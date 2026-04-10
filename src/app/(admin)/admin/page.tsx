import { db } from "@/db";
import { users, equipment, exercises, aiProviders } from "@/db/schema";
import { count } from "drizzle-orm";
import Link from "next/link";

async function getStats() {
  const [userCount] = await db.select({ count: count() }).from(users);
  const [equipmentCount] = await db.select({ count: count() }).from(equipment);
  const [exerciseCount] = await db.select({ count: count() }).from(exercises);
  const [providerCount] = await db.select({ count: count() }).from(aiProviders);
  return { userCount, equipmentCount, exerciseCount, providerCount };
}

export default async function AdminDashboard() {
  const stats = await getStats();

  const cards = [
    { label: "Benutzer", value: stats.userCount.count, href: "/admin/users" },
    { label: "Equipment", value: stats.equipmentCount.count, href: "/admin/equipment" },
    { label: "Uebungen", value: stats.exerciseCount.count, href: "/admin/exercises" },
    { label: "AI Provider", value: stats.providerCount.count, href: "/admin/ai-config" },
  ];

  return (
    <div>
      <h2 className="font-headline text-2xl font-bold text-on-surface mb-1">Dashboard</h2>
      <p className="text-sm text-on-surface-variant mb-8">Systemuebersicht</p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-xl bg-surface-container p-6 hover:bg-surface-container-high transition-colors"
          >
            <p className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
              {card.label}
            </p>
            <p className="mt-2 font-headline text-4xl font-bold text-primary">
              {card.value}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

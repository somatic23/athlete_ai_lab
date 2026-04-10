"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/admin/data-table";

type User = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  onboardingCompleted: boolean;
  createdAt: string;
  experienceLevel: string | null;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = () =>
    fetch("/api/admin/users").then((r) => r.json()).then(setUsers);

  useEffect(() => { load(); }, []);

  const toggleRole = async (user: User) => {
    const newRole = user.role === "admin" ? "user" : "admin";
    if (!confirm(`Rolle von "${user.displayName}" auf "${newRole}" setzen?`)) return;
    setTogglingId(user.id);
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, role: newRole }),
    });
    await load();
    setTogglingId(null);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-headline text-2xl font-bold text-on-surface">Benutzer</h2>
        <p className="text-sm text-on-surface-variant">{users.length} registrierte Benutzer</p>
      </div>

      <DataTable
        data={users}
        columns={[
          { key: "displayName", label: "Name" },
          { key: "email", label: "E-Mail" },
          {
            key: "role", label: "Rolle",
            render: (r) => (
              <span className={r.role === "admin" ? "text-primary font-medium" : "text-on-surface-variant"}>
                {r.role === "admin" ? "Admin" : "Benutzer"}
              </span>
            ),
          },
          { key: "experienceLevel", label: "Level", render: (r) => r.experienceLevel ?? "—" },
          {
            key: "onboardingCompleted", label: "Onboarding",
            render: (r) => (
              <span className={r.onboardingCompleted ? "text-secondary" : "text-on-surface-variant"}>
                {r.onboardingCompleted ? "Abgeschlossen" : "Ausstehend"}
              </span>
            ),
          },
          {
            key: "createdAt", label: "Registriert",
            render: (r) => new Date(r.createdAt).toLocaleDateString("de-DE"),
          },
          {
            key: "id", label: "Aktion",
            render: (r) => (
              <button
                onClick={() => toggleRole(r)}
                disabled={togglingId === r.id}
                className="rounded px-2 py-1 text-xs font-medium text-secondary hover:bg-secondary-container/20 transition-colors disabled:opacity-50"
              >
                {togglingId === r.id ? "..." : r.role === "admin" ? "Zu User" : "Zu Admin"}
              </button>
            ),
          },
        ]}
      />
    </div>
  );
}

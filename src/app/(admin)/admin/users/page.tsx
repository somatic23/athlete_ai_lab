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

function DeleteModal({
  user,
  onConfirm,
  onCancel,
  deleting,
}: {
  user: User;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface-container p-6 flex flex-col gap-5 shadow-xl">
        <div className="flex flex-col gap-1">
          <h3 className="font-headline text-lg font-bold text-on-surface">
            Benutzer löschen?
          </h3>
          <p className="text-sm text-on-surface-variant">
            Diese Aktion löscht den Account und{" "}
            <span className="font-semibold text-error">alle zugehörigen Daten</span>{" "}
            unwiderruflich — Trainingspläne, Sessions, Analysen, Chat-Verlauf und mehr.
          </p>
        </div>

        <div className="rounded-xl bg-surface-container-high px-4 py-3 flex flex-col gap-0.5">
          <p className="font-medium text-on-surface text-sm">{user.displayName}</p>
          <p className="font-mono text-xs text-on-surface-variant/60">{user.email}</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 rounded-xl border border-outline-variant/30 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 rounded-xl bg-error text-on-error py-2.5 text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50"
          >
            {deleting ? "Wird gelöscht…" : "Endgültig löschen"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/users/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDeleteError(body.error ?? "Fehler beim Löschen.");
        return;
      }
      setDeleteTarget(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      {deleteTarget && (
        <DeleteModal
          user={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => { setDeleteTarget(null); setDeleteError(null); }}
          deleting={deleting}
        />
      )}

      <div className="mb-6">
        <h2 className="font-headline text-2xl font-bold text-on-surface">Benutzer</h2>
        <p className="text-sm text-on-surface-variant">{users.length} registrierte Benutzer</p>
        {deleteError && (
          <p className="mt-2 text-sm text-error">{deleteError}</p>
        )}
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
            key: "id", label: "Aktionen",
            render: (r) => (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleRole(r)}
                  disabled={togglingId === r.id}
                  className="rounded px-2 py-1 text-xs font-medium text-secondary hover:bg-secondary-container/20 transition-colors disabled:opacity-50"
                >
                  {togglingId === r.id ? "…" : r.role === "admin" ? "Zu User" : "Zu Admin"}
                </button>
                <button
                  onClick={() => { setDeleteError(null); setDeleteTarget(r); }}
                  className="rounded px-2 py-1 text-xs font-medium text-error hover:bg-error/10 transition-colors"
                >
                  Löschen
                </button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

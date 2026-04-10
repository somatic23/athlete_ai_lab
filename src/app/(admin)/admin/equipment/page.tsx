"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUpload } from "@/components/admin/image-upload";
import Image from "next/image";

type Equipment = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
};

type FormState = { name: string; description: string; imageUrl: string; isActive: boolean };
const empty: FormState = { name: "", description: "", imageUrl: "", isActive: true };

export default function EquipmentPage() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [form, setForm] = useState<FormState>(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = () =>
    fetch("/api/admin/equipment")
      .then((r) => r.json())
      .then(setItems);

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(empty); setEditId(null); setShowForm(true); };
  const openEdit = (item: Equipment) => {
    setForm({ name: item.name, description: item.description ?? "", imageUrl: item.imageUrl ?? "", isActive: item.isActive });
    setEditId(item.id);
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    const url = editId ? `/api/admin/equipment/${editId}` : "/api/admin/equipment";
    await fetch(url, {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    await load();
    setShowForm(false);
    setSaving(false);
  };

  const remove = async (item: Equipment) => {
    if (!confirm(`"${item.name}" wirklich loeschen?`)) return;
    setDeleting(item.id);
    await fetch(`/api/admin/equipment/${item.id}`, { method: "DELETE" });
    await load();
    setDeleting(null);
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-headline text-2xl font-bold text-on-surface">Equipment</h2>
          <p className="text-sm text-on-surface-variant">{items.length} Eintraege</p>
        </div>
        <Button onClick={openCreate}>+ Neu</Button>
      </div>

      {showForm && (
        <div className="mb-6 rounded-xl bg-surface-container p-6">
          <h3 className="mb-4 font-headline text-lg font-semibold text-on-surface">
            {editId ? "Bearbeiten" : "Neu erstellen"}
          </h3>
          <div className="flex gap-6">
            <ImageUpload
              value={form.imageUrl || undefined}
              onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
              folder="equipment"
            />
            <div className="flex flex-1 flex-col gap-4">
              <Input
                label="Name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                  Beschreibung
                </label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-md bg-surface-container-highest px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 border-0 outline-none focus:bg-surface-bright focus:border-l-2 focus:border-l-primary-container transition-all resize-none"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-on-surface">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="accent-primary"
                />
                Aktiv
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setShowForm(false)}>Abbrechen</Button>
            <Button isLoading={saving} onClick={save}>Speichern</Button>
          </div>
        </div>
      )}

      <DataTable
        data={items}
        onEdit={openEdit}
        onDelete={remove}
        isDeleting={deleting}
        columns={[
          {
            key: "imageUrl",
            label: "Bild",
            render: (row) =>
              row.imageUrl ? (
                <Image src={row.imageUrl} alt={row.name} width={40} height={40} className="rounded object-cover" />
              ) : (
                <div className="h-10 w-10 rounded bg-surface-container-high" />
              ),
          },
          { key: "name", label: "Name" },
          { key: "description", label: "Beschreibung", render: (r) => r.description ?? "—" },
          {
            key: "isActive",
            label: "Status",
            render: (r) => (
              <span className={r.isActive ? "text-secondary" : "text-on-surface-variant"}>
                {r.isActive ? "Aktiv" : "Inaktiv"}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}

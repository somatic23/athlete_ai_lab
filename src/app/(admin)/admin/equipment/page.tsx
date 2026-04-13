"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUpload } from "@/components/admin/image-upload";
import Image from "next/image";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CATEGORY_LABELS,
  type EquipmentCategory,
} from "@/lib/equipment-categories";
import { cn } from "@/lib/utils/cn";

type I18n = { de: string; en: string };
type Equipment = {
  id: string;
  name: I18n;
  description: I18n;
  imageUrl: string | null;
  category: EquipmentCategory | null;
  isActive: boolean;
};

type FormState = {
  name: I18n;
  description: I18n;
  imageUrl: string;
  category: EquipmentCategory | null;
  isActive: boolean;
};

const empty: FormState = {
  name: { de: "", en: "" },
  description: { de: "", en: "" },
  imageUrl: "",
  category: null,
  isActive: true,
};

export default function EquipmentPage() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [form, setForm] = useState<FormState>(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<EquipmentCategory | null>(null);

  const load = () =>
    fetch("/api/admin/equipment")
      .then((r) => r.json())
      .then(setItems);

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(empty); setEditId(null); setShowForm(true); };
  const openEdit = (item: Equipment) => {
    setForm({
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl ?? "",
      category: item.category ?? null,
      isActive: item.isActive,
    });
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
    if (!confirm(`"${item.name.de}" wirklich loeschen?`)) return;
    setDeleting(item.id);
    await fetch(`/api/admin/equipment/${item.id}`, { method: "DELETE" });
    await load();
    setDeleting(null);
  };

  const filtered = filterCategory
    ? items.filter((i) => i.category === filterCategory)
    : items;

  // Count per category for chips
  const categoryCounts = EQUIPMENT_CATEGORIES.reduce<Record<string, number>>((acc, cat) => {
    acc[cat] = items.filter((i) => i.category === cat).length;
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-headline text-2xl font-bold text-on-surface">Equipment</h2>
          <p className="text-sm text-on-surface-variant">{items.length} Einträge</p>
        </div>
        <Button onClick={openCreate}>+ Neu</Button>
      </div>

      {/* Category filter chips */}
      <div className="mb-5 flex flex-wrap gap-2">
        <button
          onClick={() => setFilterCategory(null)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-all",
            filterCategory === null
              ? "bg-primary text-on-primary"
              : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
          )}
        >
          Alle ({items.length})
        </button>
        {EQUIPMENT_CATEGORIES.filter((cat) => categoryCounts[cat] > 0).map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-all",
              filterCategory === cat
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
            )}
          >
            {EQUIPMENT_CATEGORY_LABELS[cat].de} ({categoryCounts[cat]})
          </button>
        ))}
        {items.filter((i) => !i.category).length > 0 && (
          <span className="rounded-full px-3 py-1 text-xs font-medium bg-surface-container text-on-surface-variant/50">
            Ohne Kategorie: {items.filter((i) => !i.category).length}
          </span>
        )}
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
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Name (DE)"
                  value={form.name.de}
                  onChange={(e) => setForm((f) => ({ ...f, name: { ...f.name, de: e.target.value } }))}
                />
                <Input
                  label="Name (EN)"
                  value={form.name.en}
                  onChange={(e) => setForm((f) => ({ ...f, name: { ...f.name, en: e.target.value } }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                    Beschreibung (DE)
                  </label>
                  <textarea
                    rows={3}
                    value={form.description.de}
                    onChange={(e) => setForm((f) => ({ ...f, description: { ...f.description, de: e.target.value } }))}
                    className="w-full rounded-md bg-surface-container-highest px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 border-0 outline-none focus:bg-surface-bright focus:border-l-2 focus:border-l-primary-container transition-all resize-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                    Description (EN)
                  </label>
                  <textarea
                    rows={3}
                    value={form.description.en}
                    onChange={(e) => setForm((f) => ({ ...f, description: { ...f.description, en: e.target.value } }))}
                    className="w-full rounded-md bg-surface-container-highest px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 border-0 outline-none focus:bg-surface-bright focus:border-l-2 focus:border-l-primary-container transition-all resize-none"
                  />
                </div>
              </div>

              {/* Category selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                  Kategorie / Category
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, category: null }))}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition-all",
                      form.category === null
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-highest text-on-surface-variant hover:bg-surface-container-high"
                    )}
                  >
                    Keine / None
                  </button>
                  {EQUIPMENT_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, category: cat }))}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium transition-all",
                        form.category === cat
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container-highest text-on-surface-variant hover:bg-surface-container-high"
                      )}
                    >
                      {EQUIPMENT_CATEGORY_LABELS[cat].de} / {EQUIPMENT_CATEGORY_LABELS[cat].en}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-on-surface">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="accent-primary"
                />
                Aktiv / Active
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
        data={filtered}
        onEdit={openEdit}
        onDelete={remove}
        isDeleting={deleting}
        columns={[
          {
            key: "imageUrl",
            label: "Bild",
            render: (row) =>
              row.imageUrl ? (
                <Image src={row.imageUrl} alt={row.name.de} width={40} height={40} className="rounded object-cover" />
              ) : (
                <div className="h-10 w-10 rounded bg-surface-container-high" />
              ),
          },
          { key: "name_de", label: "Name (DE)", render: (r) => r.name.de },
          { key: "name_en", label: "Name (EN)", render: (r) => r.name.en },
          {
            key: "category",
            label: "Kategorie",
            render: (r) =>
              r.category ? (
                <span className="text-xs font-mono rounded-full px-2 py-0.5 bg-surface-container text-on-surface-variant">
                  {EQUIPMENT_CATEGORY_LABELS[r.category].de}
                </span>
              ) : (
                <span className="text-on-surface-variant/30">—</span>
              ),
          },
          { key: "description", label: "Beschreibung", render: (r) => r.description.de || "—" },
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

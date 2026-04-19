"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUpload } from "@/components/admin/image-upload";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";

const MUSCLE_GROUPS = [
  { value: "chest",       label: "Brust" },
  { value: "back",        label: "Ruecken" },
  { value: "shoulders",   label: "Schultern" },
  { value: "biceps",      label: "Bizeps" },
  { value: "triceps",     label: "Trizeps" },
  { value: "forearms",    label: "Unterarme" },
  { value: "quadriceps",  label: "Quadrizeps" },
  { value: "hamstrings",  label: "Beinbizeps" },
  { value: "glutes",      label: "Gesaess" },
  { value: "calves",      label: "Waden" },
  { value: "core",        label: "Core" },
  { value: "full_body",   label: "Ganzkörper" },
];

type I18n = { de: string; en: string };
type Exercise = {
  id: string;
  name: I18n;
  description: I18n;
  primaryMuscleGroup: string;
  imageUrl: string | null;
  trackingType: "weight_reps" | "duration";
  isActive: boolean;
  requiredEquipmentIds: string | null;
};

type EquipmentItem = { id: string; name: string };

type FormState = {
  name: I18n;
  description: I18n;
  imageUrl: string;
  primaryMuscleGroup: string;
  instructions: string;
  trackingType: "weight_reps" | "duration";
  isActive: boolean;
  requiredEquipmentIds: string[];
};

const empty: FormState = {
  name: { de: "", en: "" },
  description: { de: "", en: "" },
  imageUrl: "",
  primaryMuscleGroup: "chest",
  instructions: "",
  trackingType: "weight_reps",
  isActive: true,
  requiredEquipmentIds: [],
};

export default function ExercisesPage() {
  const [items, setItems] = useState<Exercise[]>([]);
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);
  const [form, setForm] = useState<FormState>(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = () =>
    fetch("/api/admin/exercises").then((r) => r.json()).then(setItems);

  useEffect(() => {
    load();
    fetch("/api/equipment?locale=de").then((r) => r.json()).then(setEquipmentList);
  }, []);

  const openCreate = () => { setForm(empty); setEditId(null); setShowForm(true); };
  const openEdit = (item: Exercise) => {
    let eqIds: string[] = [];
    try { eqIds = JSON.parse(item.requiredEquipmentIds ?? "[]"); } catch {}
    setForm({
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl ?? "",
      primaryMuscleGroup: item.primaryMuscleGroup,
      instructions: "",
      trackingType: item.trackingType ?? "weight_reps",
      isActive: item.isActive,
      requiredEquipmentIds: eqIds,
    });
    setEditId(item.id);
    setShowForm(true);
  };

  const toggleEquipment = (id: string) =>
    setForm((f) => ({
      ...f,
      requiredEquipmentIds: f.requiredEquipmentIds.includes(id)
        ? f.requiredEquipmentIds.filter((e) => e !== id)
        : [...f.requiredEquipmentIds, id],
    }));

  const save = async () => {
    setSaving(true);
    const url = editId ? `/api/admin/exercises/${editId}` : "/api/admin/exercises";
    await fetch(url, {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    await load();
    setShowForm(false);
    setSaving(false);
  };

  const remove = async (item: Exercise) => {
    if (!confirm(`"${item.name.de}" wirklich loeschen?`)) return;
    setDeleting(item.id);
    await fetch(`/api/admin/exercises/${item.id}`, { method: "DELETE" });
    await load();
    setDeleting(null);
  };

  const muscleLabel = (v: string) =>
    MUSCLE_GROUPS.find((m) => m.value === v)?.label ?? v;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-headline text-2xl font-bold text-on-surface">Uebungen</h2>
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
              folder="exercises"
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
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                  Primaere Muskelgruppe
                </label>
                <select
                  value={form.primaryMuscleGroup}
                  onChange={(e) => setForm((f) => ({ ...f, primaryMuscleGroup: e.target.value }))}
                  className="w-full rounded-md bg-surface-container-highest px-4 py-3 text-sm text-on-surface border-0 outline-none focus:bg-surface-bright focus:border-l-2 focus:border-l-primary-container transition-all"
                >
                  {MUSCLE_GROUPS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                  Tracking-Typ
                </label>
                <div className="seg">
                  <button
                    type="button"
                    className={cn(form.trackingType === "weight_reps" && "on")}
                    onClick={() => setForm((f) => ({ ...f, trackingType: "weight_reps" }))}
                  >
                    Gewicht + Wdh.
                  </button>
                  <button
                    type="button"
                    className={cn(form.trackingType === "duration" && "on")}
                    onClick={() => setForm((f) => ({ ...f, trackingType: "duration" }))}
                  >
                    Dauer (min)
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                    Beschreibung (DE)
                  </label>
                  <textarea
                    rows={2}
                    value={form.description.de}
                    onChange={(e) => setForm((f) => ({ ...f, description: { ...f.description, de: e.target.value } }))}
                    className="w-full rounded-md bg-surface-container-highest px-4 py-3 text-sm text-on-surface border-0 outline-none focus:bg-surface-bright focus:border-l-2 focus:border-l-primary-container transition-all resize-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                    Description (EN)
                  </label>
                  <textarea
                    rows={2}
                    value={form.description.en}
                    onChange={(e) => setForm((f) => ({ ...f, description: { ...f.description, en: e.target.value } }))}
                    className="w-full rounded-md bg-surface-container-highest px-4 py-3 text-sm text-on-surface border-0 outline-none focus:bg-surface-bright focus:border-l-2 focus:border-l-primary-container transition-all resize-none"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                  Benoetiges Equipment
                </label>
                <div className="flex flex-wrap gap-2">
                  {equipmentList.map((eq) => (
                    <button
                      key={eq.id}
                      type="button"
                      onClick={() => toggleEquipment(eq.id)}
                      className={cn(
                        "rounded px-2.5 py-1 text-xs font-medium transition-all",
                        form.requiredEquipmentIds.includes(eq.id)
                          ? "bg-primary-container text-on-primary"
                          : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                      )}
                    >
                      {eq.name}
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
                Aktiv
              </label>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
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
                <Image src={row.imageUrl} alt={row.name.de} width={40} height={40} className="rounded object-cover" />
              ) : (
                <div className="h-10 w-10 rounded bg-surface-container-high" />
              ),
          },
          { key: "name_de", label: "Name (DE)", render: (r) => r.name.de },
          { key: "name_en", label: "Name (EN)", render: (r) => r.name.en },
          { key: "primaryMuscleGroup", label: "Muskelgruppe", render: (r) => muscleLabel(r.primaryMuscleGroup) },
          {
            key: "isActive", label: "Status",
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

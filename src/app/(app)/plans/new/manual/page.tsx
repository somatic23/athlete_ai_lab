"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── Types ──────────────────────────────────────────────────────────────

type CatalogExercise = {
  id: string;
  nameI18n: string;
  primaryMuscleGroup: string;
  trackingType: "weight_reps" | "duration";
};

type PlanExRow = {
  uid: string;
  exerciseId: string;
  exerciseName: string;
  trackingType: "weight_reps" | "duration";
  sets: number | "";
  repsMin: number | "";
  repsMax: number | "";
  durationSeconds: number | "";
  restSeconds: number | "";
  notes: string;
};

type PlanDay = {
  uid: string;
  title: string;
  focus: string;
  estimatedDurationMin: number | "";
  exercises: PlanExRow[];
};

// ── Helpers ────────────────────────────────────────────────────────────

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Brust", back: "Rücken", shoulders: "Schultern",
  biceps: "Bizeps", triceps: "Trizeps", forearms: "Unterarme",
  quadriceps: "Quadrizeps", hamstrings: "Hamstrings", glutes: "Gesäß",
  calves: "Waden", core: "Core", full_body: "Ganzkörper",
};

function parseName(nameI18n: string): string {
  try {
    const p = JSON.parse(nameI18n);
    return p.de ?? p.en ?? nameI18n;
  } catch {
    return nameI18n;
  }
}

function mkId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function emptyDay(index: number): PlanDay {
  return { uid: mkId(), title: `Tag ${index + 1}`, focus: "", estimatedDurationMin: "", exercises: [] };
}

function emptyExRow(ex: CatalogExercise): PlanExRow {
  return {
    uid: mkId(),
    exerciseId: ex.id,
    exerciseName: parseName(ex.nameI18n),
    trackingType: ex.trackingType ?? "weight_reps",
    sets: 3,
    repsMin: 8,
    repsMax: 12,
    durationSeconds: "",
    restSeconds: 90,
    notes: "",
  };
}

// ── Exercise picker ────────────────────────────────────────────────────

const MUSCLE_GROUPS = Object.entries(MUSCLE_LABELS);

function ExercisePicker({
  catalog,
  onAdd,
  onClose,
}: {
  catalog: CatalogExercise[];
  onAdd: (ex: CatalogExercise) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<string | null>(null);

  const filtered = catalog.filter((ex) => {
    if (muscleFilter && ex.primaryMuscleGroup !== muscleFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const name = parseName(ex.nameI18n).toLowerCase();
    const muscle = (MUSCLE_LABELS[ex.primaryMuscleGroup] ?? ex.primaryMuscleGroup).toLowerCase();
    return name.includes(q) || muscle.includes(q);
  });

  return (
    <div className="mt-3 rounded-xl bg-surface-container-highest p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Übung suchen..."
          className="flex-1 rounded-lg bg-surface-container px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:bg-surface-bright transition-colors"
        />
        <button
          onClick={onClose}
          className="text-xs text-on-surface-variant hover:text-on-surface transition-colors px-2"
        >
          ✕
        </button>
      </div>

      {/* Muscle group chips */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setMuscleFilter(null)}
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-all min-w-[4rem] text-center",
            muscleFilter === null
              ? "bg-primary/20 text-primary border-primary/30"
              : "bg-transparent text-on-surface-variant/60 border-outline-variant/20 hover:border-outline-variant"
          )}
        >
          Alle
        </button>
        {MUSCLE_GROUPS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMuscleFilter(muscleFilter === key ? null : key)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-all",
              muscleFilter === key
                ? "bg-primary/20 text-primary border-primary/30"
                : "bg-transparent text-on-surface-variant/60 border-outline-variant/20 hover:border-outline-variant"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="max-h-52 overflow-y-auto flex flex-col gap-0.5">
        {filtered.length === 0 ? (
          <p className="text-xs text-on-surface-variant py-2 text-center">Keine Übungen gefunden</p>
        ) : (
          filtered.map((ex) => (
            <button
              key={ex.id}
              onClick={() => onAdd(ex)}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-container transition-colors"
            >
              <span className="text-on-surface font-medium">{parseName(ex.nameI18n)}</span>
              <span className="text-xs font-mono text-on-surface-variant ml-3 shrink-0">
                {MUSCLE_LABELS[ex.primaryMuscleGroup] ?? ex.primaryMuscleGroup}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── Exercise row editor ────────────────────────────────────────────────

function ExerciseRowEditor({
  row,
  onChange,
  onRemove,
}: {
  row: PlanExRow;
  onChange: (patch: Partial<PlanExRow>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg bg-surface-container p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-on-surface truncate">{row.exerciseName}</span>
        <button
          onClick={onRemove}
          className="text-xs text-on-surface-variant/50 hover:text-error transition-colors shrink-0"
        >
          ✕
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-on-surface-variant/70">Sets</label>
          <input
            type="number"
            min={1}
            value={row.sets}
            onChange={(e) => onChange({ sets: e.target.value === "" ? "" : parseInt(e.target.value) })}
            className="w-full rounded-md bg-surface-container-highest px-2 py-1.5 text-sm text-on-surface text-center outline-none focus:bg-surface-bright transition-colors"
          />
        </div>
        {row.trackingType === "duration" ? (
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-xs text-on-surface-variant/70">Dauer (min)</label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={row.durationSeconds !== "" ? row.durationSeconds / 60 : ""}
              onChange={(e) => onChange({ durationSeconds: e.target.value === "" ? "" : Math.round(parseFloat(e.target.value) * 60) })}
              placeholder="1"
              className="w-full rounded-md bg-surface-container-highest px-2 py-1.5 text-sm text-on-surface text-center outline-none focus:bg-surface-bright transition-colors"
            />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-on-surface-variant/70">Wdh. min</label>
              <input
                type="number"
                min={1}
                value={row.repsMin}
                onChange={(e) => onChange({ repsMin: e.target.value === "" ? "" : parseInt(e.target.value) })}
                className="w-full rounded-md bg-surface-container-highest px-2 py-1.5 text-sm text-on-surface text-center outline-none focus:bg-surface-bright transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-on-surface-variant/70">Wdh. max</label>
              <input
                type="number"
                min={1}
                value={row.repsMax}
                onChange={(e) => onChange({ repsMax: e.target.value === "" ? "" : parseInt(e.target.value) })}
                placeholder="—"
                className="w-full rounded-md bg-surface-container-highest px-2 py-1.5 text-sm text-on-surface text-center outline-none focus:bg-surface-bright transition-colors placeholder:text-on-surface-variant/30"
              />
            </div>
          </>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-on-surface-variant/70">Pause (s)</label>
          <input
            type="number"
            min={0}
            step={15}
            value={row.restSeconds}
            onChange={(e) => onChange({ restSeconds: e.target.value === "" ? "" : parseInt(e.target.value) })}
            className="w-full rounded-md bg-surface-container-highest px-2 py-1.5 text-sm text-on-surface text-center outline-none focus:bg-surface-bright transition-colors"
          />
        </div>
      </div>
      <input
        type="text"
        value={row.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        placeholder="Notiz (optional)"
        className="w-full rounded-md bg-surface-container-highest px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/40 outline-none focus:bg-surface-bright transition-colors"
      />
    </div>
  );
}

// ── Day editor ─────────────────────────────────────────────────────────

function DayEditor({
  day,
  dayIndex,
  catalog,
  onUpdate,
  onRemove,
  onUpdateExercise,
  onRemoveExercise,
  onAddExercise,
}: {
  day: PlanDay;
  dayIndex: number;
  catalog: CatalogExercise[];
  onUpdate: (patch: Partial<Omit<PlanDay, "uid" | "exercises">>) => void;
  onRemove: () => void;
  onUpdateExercise: (exUid: string, patch: Partial<PlanExRow>) => void;
  onRemoveExercise: (exUid: string) => void;
  onAddExercise: (ex: CatalogExercise) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="rounded-xl bg-surface-container overflow-hidden">
      {/* Day header */}
      <div className="px-5 py-4 bg-surface-container-high flex items-start gap-3">
        <div className="flex-1 grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <Input
              id={`day-title-${day.uid}`}
              label={`Tag ${dayIndex + 1}`}
              value={day.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              placeholder="z.B. Push A"
            />
          </div>
          <div>
            <Input
              id={`day-focus-${day.uid}`}
              label="Fokus"
              value={day.focus}
              onChange={(e) => onUpdate({ focus: e.target.value })}
              placeholder="z.B. Brust / Schultern"
            />
          </div>
          <div>
            <Input
              id={`day-dur-${day.uid}`}
              label="Dauer (min)"
              type="number"
              value={day.estimatedDurationMin}
              onChange={(e) => onUpdate({ estimatedDurationMin: e.target.value === "" ? "" : parseInt(e.target.value) })}
              placeholder="60"
            />
          </div>
        </div>
        <button
          onClick={onRemove}
          className="mt-6 text-xs text-on-surface-variant/40 hover:text-error transition-colors shrink-0"
          title="Tag entfernen"
        >
          ✕
        </button>
      </div>

      {/* Exercise list */}
      <div className="px-5 pb-5">
        {day.exercises.length > 0 && (
          <div className="flex flex-col gap-2 mt-4">
            {day.exercises.map((ex) => (
              <ExerciseRowEditor
                key={ex.uid}
                row={ex}
                onChange={(patch) => onUpdateExercise(ex.uid, patch)}
                onRemove={() => onRemoveExercise(ex.uid)}
              />
            ))}
          </div>
        )}

        {/* Picker or add button */}
        {pickerOpen ? (
          <ExercisePicker
            catalog={catalog}
            onAdd={(ex) => {
              onAddExercise(ex);
            }}
            onClose={() => setPickerOpen(false)}
          />
        ) : (
          <button
            onClick={() => setPickerOpen(true)}
            className={cn(
              "mt-4 w-full rounded-lg border border-dashed border-outline-variant/30 py-2.5 text-xs text-on-surface-variant",
              "hover:border-secondary/40 hover:text-secondary transition-all"
            )}
          >
            + Übung hinzufügen
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────

export default function ManualPlanPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [days, setDays] = useState<PlanDay[]>([emptyDay(0)]);
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/exercises")
      .then((r) => r.json())
      .then(setCatalog)
      .catch(() => {});
  }, []);

  function updateDay(uid: string, patch: Partial<Omit<PlanDay, "uid" | "exercises">>) {
    setDays((prev) => prev.map((d) => d.uid === uid ? { ...d, ...patch } : d));
  }

  function removeDay(uid: string) {
    setDays((prev) => prev.filter((d) => d.uid !== uid));
  }

  function addExercise(dayUid: string, ex: CatalogExercise) {
    setDays((prev) => prev.map((d) =>
      d.uid === dayUid ? { ...d, exercises: [...d.exercises, emptyExRow(ex)] } : d
    ));
  }

  function updateExercise(dayUid: string, exUid: string, patch: Partial<PlanExRow>) {
    setDays((prev) => prev.map((d) =>
      d.uid === dayUid
        ? { ...d, exercises: d.exercises.map((e) => e.uid === exUid ? { ...e, ...patch } : e) }
        : d
    ));
  }

  function removeExercise(dayUid: string, exUid: string) {
    setDays((prev) => prev.map((d) =>
      d.uid === dayUid ? { ...d, exercises: d.exercises.filter((e) => e.uid !== exUid) } : d
    ));
  }

  async function save() {
    if (!title.trim()) {
      setError("Bitte einen Plantitel eingeben.");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const body = {
        manual: true,
        title: title.trim(),
        description: description.trim() || undefined,
        days: days.map((d) => ({
          title: d.title,
          focus: d.focus || undefined,
          estimatedDurationMin: typeof d.estimatedDurationMin === "number" ? d.estimatedDurationMin : undefined,
          exercises: d.exercises.map((e) => ({
            exerciseId: e.exerciseId,
            sets: typeof e.sets === "number" ? e.sets : 3,
            repsMin: e.trackingType === "duration" ? 0 : (typeof e.repsMin === "number" ? e.repsMin : 8),
            repsMax: e.trackingType === "duration" ? undefined : (typeof e.repsMax === "number" ? e.repsMax : undefined),
            durationSeconds: e.trackingType === "duration" ? (typeof e.durationSeconds === "number" ? e.durationSeconds : undefined) : undefined,
            restSeconds: typeof e.restSeconds === "number" ? e.restSeconds : undefined,
            notes: e.notes || undefined,
          })),
        })),
      };

      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Fehler beim Speichern");
      }

      const saved = await res.json();
      router.push(`/plans/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b border-outline-variant/10 bg-surface/90 backdrop-blur-sm px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            onClick={() => router.push("/plans/new")}
            className="text-xs font-mono text-on-surface-variant hover:text-on-surface transition-colors"
          >
            ← Plan erstellen
          </button>
          <span className="text-on-surface-variant/30">|</span>
          <span className="font-headline text-sm font-bold text-on-surface">Manueller Plan</span>
          <div className="flex-1" />
          <Button onClick={save} isLoading={saving} size="sm">
            Speichern
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6 flex flex-col gap-5 pb-24">
        {/* Plan meta */}
        <div className="rounded-xl bg-surface-container p-5 flex flex-col gap-4">
          <h2 className="font-headline font-semibold text-on-surface">Plan-Details</h2>
          <Input
            id="plan-title"
            label="Titel"
            placeholder="z.B. 4-Tage Push/Pull Split"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="plan-desc"
              className="text-xs font-medium uppercase tracking-widest text-on-surface-variant"
            >
              Beschreibung
            </label>
            <textarea
              id="plan-desc"
              rows={2}
              placeholder="Optionale Beschreibung..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md bg-surface-container-highest px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 border-0 outline-none transition-all resize-none focus:bg-surface-bright"
            />
          </div>
        </div>

        {/* Training days */}
        {days.map((day, i) => (
          <DayEditor
            key={day.uid}
            day={day}
            dayIndex={i}
            catalog={catalog}
            onUpdate={(patch) => updateDay(day.uid, patch)}
            onRemove={() => removeDay(day.uid)}
            onUpdateExercise={(exUid, patch) => updateExercise(day.uid, exUid, patch)}
            onRemoveExercise={(exUid) => removeExercise(day.uid, exUid)}
            onAddExercise={(ex) => addExercise(day.uid, ex)}
          />
        ))}

        {/* Add day button */}
        <button
          onClick={() => setDays((prev) => [...prev, emptyDay(prev.length)])}
          className="rounded-xl border-2 border-dashed border-outline-variant/20 py-4 text-sm text-on-surface-variant hover:border-primary/30 hover:text-primary transition-all"
        >
          + Trainingstag hinzufügen
        </button>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-error-container/20 px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

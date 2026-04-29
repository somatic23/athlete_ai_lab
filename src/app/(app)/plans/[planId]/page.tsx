"use client";

import { useEffect, useState, useCallback } from "react";
import type { CoachingSuggestion } from "@/lib/ai/coaching-suggestion-schema";
import { ExerciseAlternativesModal, type ExerciseAlternative } from "@/components/exercise-alternatives-modal";
import { useParams, useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── DB types (from API) ────────────────────────────────────────────────

type PlanExercise = {
  id: string;
  sortOrder: number;
  sets: number;
  repsMin: number;
  repsMax: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  suggestedWeightKg: number | null;
  notes: string | null;
  exercise: { id: string; nameI18n: string; primaryMuscleGroup: string; trackingType: "weight_reps" | "duration" };
};

type TrainingDay = {
  id: string;
  dayNumber: number;
  title: string;
  focus: string | null;
  estimatedDurationMin: number | null;
  sortOrder: number;
  pendingAiSuggestion: string | null;
  exercises: PlanExercise[];
};

type Plan = {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "active" | "scheduled" | "archived";
  aiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
  days: TrainingDay[];
};

// ── Edit-mode types ────────────────────────────────────────────────────

type EditExercise = {
  uid: string;
  exerciseId: string;
  exerciseName: string;
  primaryMuscleGroup: string;
  trackingType: "weight_reps" | "duration";
  sets: number | "";
  repsMin: number | "";
  repsMax: number | "";
  durationSeconds: number | "";
  restSeconds: number | "";
  suggestedWeightKg: number | "";
  notes: string;
};

type EditDay = {
  uid: string;
  title: string;
  focus: string;
  estimatedDurationMin: number | "";
  exercises: EditExercise[];
};

type CatalogExercise = {
  id: string;
  nameI18n: string;
  primaryMuscleGroup: string;
  trackingType: "weight_reps" | "duration";
};

// ── Helpers ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<Plan["status"], string> = {
  draft: "Entwurf", active: "Aktiv", scheduled: "Geplant", archived: "Archiviert",
};
const STATUS_COLORS: Record<Plan["status"], string> = {
  draft: "text-on-surface-variant bg-surface-container-high",
  active: "text-secondary bg-secondary-container/30",
  scheduled: "text-tertiary bg-tertiary-container/30",
  archived: "text-on-surface-variant/50 bg-surface-container",
};
const MUSCLE_LABELS: Record<string, string> = {
  chest: "Brust", back: "Rücken", shoulders: "Schultern",
  biceps: "Bizeps", triceps: "Trizeps", forearms: "Unterarme",
  quadriceps: "Quadrizeps", hamstrings: "Hamstrings", glutes: "Gesäß",
  calves: "Waden", core: "Core", full_body: "Ganzkörper",
};

function parseName(nameI18n: string, locale = "de"): string {
  try { const p = JSON.parse(nameI18n); return p[locale] ?? p.de ?? p.en ?? nameI18n; }
  catch { return nameI18n; }
}
function repsLabel(min: number, max: number | null) { return max ? `${min}–${max}` : String(min); }
function mkId() { return Math.random().toString(36).slice(2, 10); }

function toEditDays(days: TrainingDay[]): EditDay[] {
  return days.map((d) => ({
    uid: d.id,
    title: d.title,
    focus: d.focus ?? "",
    estimatedDurationMin: d.estimatedDurationMin ?? "",
    exercises: d.exercises.map((ex) => ({
      uid: ex.id,
      exerciseId: ex.exercise.id,
      exerciseName: parseName(ex.exercise.nameI18n),
      primaryMuscleGroup: ex.exercise.primaryMuscleGroup,
      trackingType: ex.exercise.trackingType ?? "weight_reps",
      sets: ex.sets,
      repsMin: ex.repsMin,
      repsMax: ex.repsMax ?? "",
      durationSeconds: ex.durationSeconds ?? "",
      restSeconds: ex.restSeconds ?? "",
      suggestedWeightKg: ex.suggestedWeightKg ?? "",
      notes: ex.notes ?? "",
    })),
  }));
}

function toApiPayload(title: string, description: string, days: EditDay[]) {
  return {
    title,
    description: description || null,
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
        suggestedWeightKg: e.trackingType === "duration" ? undefined : (typeof e.suggestedWeightKg === "number" ? e.suggestedWeightKg : undefined),
        notes: e.notes || undefined,
      })),
    })),
  };
}

// ── Exercise picker ────────────────────────────────────────────────────

function ExercisePicker({ catalog, onAdd, onClose }: {
  catalog: CatalogExercise[];
  onAdd: (ex: CatalogExercise) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = catalog.filter((ex) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return parseName(ex.nameI18n).toLowerCase().includes(q)
      || (MUSCLE_LABELS[ex.primaryMuscleGroup] ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="mt-3 rounded-xl bg-surface-container-highest p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Übung suchen..."
          className="flex-1 rounded-lg bg-surface-container px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:bg-surface-bright transition-colors"
        />
        <button onClick={onClose} className="px-2 text-xs text-on-surface-variant hover:text-on-surface transition-colors">✕</button>
      </div>
      <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
        {filtered.length === 0 ? (
          <p className="py-2 text-center text-xs text-on-surface-variant">Keine Ergebnisse</p>
        ) : filtered.map((ex) => (
          <button
            key={ex.id}
            onClick={() => onAdd(ex)}
            className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-container transition-colors"
          >
            <span className="text-on-surface font-medium">{parseName(ex.nameI18n)}</span>
            <span className="ml-3 shrink-0 text-xs font-mono text-on-surface-variant">
              {MUSCLE_LABELS[ex.primaryMuscleGroup] ?? ex.primaryMuscleGroup}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Sortable exercise row (edit mode) ──────────────────────────────────

function SortableExRow({ ex, onChange, onRemove }: {
  ex: EditExercise;
  onChange: (patch: Partial<EditExercise>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: ex.uid });
  const [showAltModal, setShowAltModal] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const numInput = (
    value: number | "",
    key: keyof EditExercise,
    props?: React.InputHTMLAttributes<HTMLInputElement>,
    float?: boolean
  ) => (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange({ [key]: e.target.value === "" ? "" : (float ? parseFloat(e.target.value) : parseInt(e.target.value)) } as Partial<EditExercise>)}
      className="w-full rounded-md bg-surface-container-highest px-2 py-1.5 text-center text-sm text-on-surface outline-none focus:bg-surface-bright transition-colors"
      {...props}
    />
  );

  function handleSelectAlternative(alt: ExerciseAlternative) {
    onChange({
      exerciseId: alt.exerciseId,
      exerciseName: alt.exerciseName,
      primaryMuscleGroup: alt.primaryMuscleGroup,
      sets: alt.sets,
      repsMin: alt.repsMin,
      repsMax: alt.repsMax ?? "",
      suggestedWeightKg: alt.suggestedWeightKg ?? "",
    });
    setShowAltModal(false);
  }

  return (
    <>
    <div ref={setNodeRef} style={style} className="rounded-lg bg-surface-container p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none text-on-surface-variant/40 hover:text-on-surface-variant transition-colors px-1"
          title="Verschieben"
        >
          ⠿
        </button>
        <span className="flex-1 text-sm font-medium text-on-surface truncate">{ex.exerciseName}</span>
        <span className="shrink-0 text-xs font-mono text-on-surface-variant/50">
          {MUSCLE_LABELS[ex.primaryMuscleGroup] ?? ex.primaryMuscleGroup}
        </span>
        <button
          onClick={() => setShowAltModal(true)}
          className="shrink-0 text-xs font-mono text-secondary/70 hover:text-secondary transition-colors px-1"
          title="KI-Alternative vorschlagen"
        >
          ⇄
        </button>
        <button onClick={onRemove} className="text-xs text-on-surface-variant/40 hover:text-error transition-colors px-1">✕</button>
      </div>
      <div className="grid grid-cols-5 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-center text-xs text-on-surface-variant/60">Sets</label>
          {numInput(ex.sets, "sets", { min: 1 })}
        </div>
        {ex.trackingType === "duration" ? (
          <div className="col-span-3 flex flex-col gap-1">
            <label className="text-center text-xs text-on-surface-variant/60">Dauer (min)</label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={ex.durationSeconds !== "" ? ex.durationSeconds / 60 : ""}
              onChange={(e) => onChange({ durationSeconds: e.target.value === "" ? "" : Math.round(parseFloat(e.target.value) * 60) } as Partial<EditExercise>)}
              className="w-full rounded-md bg-surface-container-highest px-2 py-1.5 text-center text-sm text-on-surface outline-none focus:bg-surface-bright transition-colors"
            />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-center text-xs text-on-surface-variant/60">Wdh. min</label>
              {numInput(ex.repsMin, "repsMin", { min: 1 })}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-center text-xs text-on-surface-variant/60">Wdh. max</label>
              {numInput(ex.repsMax, "repsMax", { min: 1, placeholder: "—" })}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-center text-xs text-on-surface-variant/60">Gewicht (kg)</label>
              {numInput(ex.suggestedWeightKg, "suggestedWeightKg", { min: 0, step: 0.5, placeholder: "—" }, true)}
            </div>
          </>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-center text-xs text-on-surface-variant/60">Pause (s)</label>
          {numInput(ex.restSeconds, "restSeconds", { min: 0, step: 15 })}
        </div>
      </div>
      <input
        type="text"
        value={ex.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        placeholder="Notiz (optional)"
        className="w-full rounded-md bg-surface-container-highest px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/40 outline-none focus:bg-surface-bright transition-colors"
      />
    </div>
    {showAltModal && (
      <ExerciseAlternativesModal
        exerciseId={ex.exerciseId}
        exerciseName={ex.exerciseName}
        primaryMuscleGroup={ex.primaryMuscleGroup}
        sets={typeof ex.sets === "number" ? ex.sets : 3}
        repsMin={typeof ex.repsMin === "number" ? ex.repsMin : 8}
        repsMax={typeof ex.repsMax === "number" ? ex.repsMax : null}
        suggestedWeightKg={typeof ex.suggestedWeightKg === "number" ? ex.suggestedWeightKg : null}
        onSelect={handleSelectAlternative}
        onClose={() => setShowAltModal(false)}
      />
    )}
    </>
  );
}

// ── Edit day section ───────────────────────────────────────────────────

function EditDaySection({
  day, dayIndex, totalDays, catalog,
  onUpdate, onRemove, onMoveUp, onMoveDown,
  onAddExercise, onUpdateExercise, onRemoveExercise, onReorderExercises,
}: {
  day: EditDay; dayIndex: number; totalDays: number;
  catalog: CatalogExercise[];
  onUpdate: (patch: Partial<Omit<EditDay, "uid" | "exercises">>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddExercise: (ex: CatalogExercise) => void;
  onUpdateExercise: (uid: string, patch: Partial<EditExercise>) => void;
  onRemoveExercise: (uid: string) => void;
  onReorderExercises: (newOrder: EditExercise[]) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = day.exercises.findIndex((e) => e.uid === active.id);
      const newIndex = day.exercises.findIndex((e) => e.uid === over.id);
      onReorderExercises(arrayMove(day.exercises, oldIndex, newIndex));
    }
  }

  return (
    <div className="rounded-xl bg-surface-container overflow-hidden">
      {/* Day header */}
      <div className="bg-surface-container-high px-5 py-4">
        <div className="flex items-start gap-2 mb-3">
          <div className="flex flex-col gap-1 shrink-0 mt-1">
            <button onClick={onMoveUp} disabled={dayIndex === 0} className="text-on-surface-variant/40 hover:text-on-surface disabled:opacity-20 transition-colors leading-none" title="Nach oben">▴</button>
            <button onClick={onMoveDown} disabled={dayIndex === totalDays - 1} className="text-on-surface-variant/40 hover:text-on-surface disabled:opacity-20 transition-colors leading-none" title="Nach unten">▾</button>
          </div>
          <span className="text-xs font-mono text-on-surface-variant/50 mt-1.5 shrink-0">Tag {dayIndex + 1}</span>
          <div className="flex-1 grid grid-cols-3 gap-3">
            <Input id={`title-${day.uid}`} label="Titel" value={day.title} onChange={(e) => onUpdate({ title: e.target.value })} />
            <Input id={`focus-${day.uid}`} label="Fokus" value={day.focus} onChange={(e) => onUpdate({ focus: e.target.value })} placeholder="z.B. Brust" />
            <Input id={`dur-${day.uid}`} label="Dauer (min)" type="number" value={day.estimatedDurationMin} onChange={(e) => onUpdate({ estimatedDurationMin: e.target.value === "" ? "" : parseInt(e.target.value) })} placeholder="60" />
          </div>
          <button onClick={onRemove} className="mt-1.5 shrink-0 text-xs text-on-surface-variant/40 hover:text-error transition-colors" title="Tag entfernen">✕</button>
        </div>
      </div>

      {/* Exercises */}
      <div className="px-5 pb-5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={day.exercises.map((e) => e.uid)} strategy={verticalListSortingStrategy}>
            {day.exercises.length > 0 && (
              <div className="flex flex-col gap-2 mt-4">
                {day.exercises.map((ex) => (
                  <SortableExRow
                    key={ex.uid}
                    ex={ex}
                    onChange={(patch) => onUpdateExercise(ex.uid, patch)}
                    onRemove={() => onRemoveExercise(ex.uid)}
                  />
                ))}
              </div>
            )}
          </SortableContext>
        </DndContext>

        {pickerOpen ? (
          <ExercisePicker
            catalog={catalog}
            onAdd={(ex) => { onAddExercise(ex); }}
            onClose={() => setPickerOpen(false)}
          />
        ) : (
          <button
            onClick={() => setPickerOpen(true)}
            className="mt-4 w-full rounded-lg border border-dashed border-outline-variant/20 py-2.5 text-xs text-on-surface-variant hover:border-secondary/40 hover:text-secondary transition-all"
          >
            + Übung hinzufügen
          </button>
        )}
      </div>
    </div>
  );
}

// ── SuggestionCard ─────────────────────────────────────────────────────

const CHANGE_TYPE_LABEL: Record<string, string> = {
  progression: "↑ Progression",
  deload: "↓ Deload",
  maintenance: "= Unverändert",
  recovery: "♻ Recovery",
};
const CHANGE_TYPE_COLOR: Record<string, string> = {
  progression: "text-secondary",
  deload: "text-error",
  maintenance: "text-on-surface-variant/50",
  recovery: "text-tertiary",
};

function SuggestionCard({ dayId, planId, currentExercises, suggestion, onAccepted, onRejected }: {
  dayId: string;
  planId: string;
  currentExercises: PlanExercise[];
  suggestion: CoachingSuggestion;
  onAccepted: () => void;
  onRejected: () => void;
}) {
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setAccepting(true); setError(null);
    const res = await fetch(`/api/plans/${planId}/days/${dayId}/suggest`, { method: "PATCH" });
    if (res.ok) { onAccepted(); }
    else {
      const text = await res.text();
      let msg = "Fehler";
      try { msg = (JSON.parse(text) as { error?: string }).error ?? msg; } catch { /* ignore */ }
      setError(msg);
      setAccepting(false);
    }
  }

  async function handleReject() {
    setRejecting(true);
    await fetch(`/api/plans/${planId}/days/${dayId}/suggest`, { method: "DELETE" });
    onRejected();
  }

  return (
    <div className="mt-3 rounded-xl border border-secondary/20 bg-secondary/5 overflow-hidden">
      <div className="px-4 py-3 border-b border-secondary/10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-secondary">✦ KI-Coaching-Vorschlag</span>
            {suggestion.source === "auto" && (
              <span className="rounded-full border border-secondary/30 bg-secondary/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-secondary">
                Auto nach Workout
              </span>
            )}
          </div>
          <span className="text-xs font-mono text-on-surface-variant/50">
            {new Date(suggestion.generatedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        {suggestion.rationale && (
          <p className="mt-1.5 text-xs text-on-surface-variant leading-relaxed">{suggestion.rationale}</p>
        )}
      </div>

      <div className="px-4 py-2">
        {/* Table header */}
        <div className="flex items-center gap-2 pb-1.5 text-xs font-mono text-on-surface-variant/40">
          <span className="flex-1">Übung</span>
          <span className="w-28 text-right">Aktuell</span>
          <span className="w-28 text-right">Vorschlag</span>
          <span className="w-20 text-right">Änderung</span>
        </div>

        {suggestion.exercises.map((sEx) => {
          const current = currentExercises.find((c) => c.exercise.id === sEx.exerciseId);
          const curStr = current
            ? `${current.sets}×${repsLabel(current.repsMin, current.repsMax)}${current.suggestedWeightKg ? ` · ${current.suggestedWeightKg}kg` : ""}`
            : "—";
          const sugStr = `${sEx.sets}×${repsLabel(sEx.repsMin, sEx.repsMax ?? null)}${sEx.suggestedWeightKg != null ? ` · ${sEx.suggestedWeightKg}kg` : ""}`;
          const changed = curStr !== sugStr;

          return (
            <div
              key={sEx.exerciseId}
              className={cn(
                "py-2 border-b border-outline-variant/5 last:border-0",
                sEx.changeType === "progression" && changed && "bg-secondary/5 -mx-4 px-4",
                sEx.changeType === "deload" && "bg-error/5 -mx-4 px-4",
              )}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-on-surface truncate">{sEx.exerciseName}</p>
                  {sEx.changeReason && <p className="text-xs font-mono text-on-surface-variant/50 mt-0.5 leading-tight">{sEx.changeReason}</p>}
                </div>
                <span className="w-28 text-right text-xs font-mono text-on-surface-variant/60 shrink-0">{curStr}</span>
                <span className="w-28 text-right text-xs font-mono text-on-surface shrink-0">{sugStr}</span>
                <span className={cn("w-20 text-right text-xs font-mono shrink-0", CHANGE_TYPE_COLOR[sEx.changeType] ?? "text-on-surface-variant")}>
                  {CHANGE_TYPE_LABEL[sEx.changeType] ?? sEx.changeType}
                </span>
              </div>
              {sEx.notes && <p className="mt-0.5 text-xs text-on-surface-variant/60 italic">{sEx.notes}</p>}
            </div>
          );
        })}
      </div>

      {error && <div className="mx-4 mb-2 rounded-lg bg-error-container/20 px-3 py-2 text-xs text-error">{error}</div>}

      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-secondary/10">
        <button
          onClick={handleReject}
          disabled={rejecting || accepting}
          className="text-xs font-mono text-on-surface-variant hover:text-error disabled:opacity-40 transition-colors"
        >
          {rejecting ? "…" : "Verwerfen"}
        </button>
        <button
          onClick={handleAccept}
          disabled={accepting || rejecting}
          className="text-xs font-mono font-bold text-secondary hover:opacity-80 disabled:opacity-40 transition-all"
        >
          {accepting ? "…" : "Übernehmen →"}
        </button>
      </div>
    </div>
  );
}

// ── Read-only day section ──────────────────────────────────────────────

function DaySection({ day, planId, onPlanRefresh }: {
  day: TrainingDay;
  planId: string;
  onPlanRefresh: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [localSuggestion, setLocalSuggestion] = useState<CoachingSuggestion | null>(() => {
    try { return day.pendingAiSuggestion ? (JSON.parse(day.pendingAiSuggestion) as CoachingSuggestion) : null; }
    catch { return null; }
  });

  async function handleRequestSuggestion() {
    setSuggesting(true); setSuggestionError(null);
    const res = await fetch(`/api/plans/${planId}/days/${day.id}/suggest`, { method: "POST" });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text) as Record<string, unknown>; } catch { setSuggestionError("Server-Fehler"); setSuggesting(false); return; }
    if (!res.ok) setSuggestionError((data.error as string) ?? "Fehler");
    else setLocalSuggestion(data.suggestion as CoachingSuggestion);
    setSuggesting(false);
  }

  return (
    <div className="rounded-xl bg-surface-container overflow-hidden">
      <div className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-container-high transition-colors">
        <div className="flex-1 cursor-pointer" onClick={() => setOpen(!open)}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-on-surface-variant/50">Tag {day.dayNumber}</span>
            {day.focus && <span className="text-xs font-mono text-secondary">{day.focus}</span>}
          </div>
          <h4 className="font-headline font-bold text-on-surface mt-0.5">{day.title}</h4>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {!localSuggestion && (
            <button
              onClick={handleRequestSuggestion}
              disabled={suggesting}
              className="text-xs font-mono text-secondary hover:opacity-80 disabled:opacity-40 transition-all"
            >
              {suggesting ? "…" : "✦ KI-Vorschlag"}
            </button>
          )}
          <span className="text-xs font-mono text-on-surface-variant cursor-pointer" onClick={() => setOpen(!open)}>
            {day.exercises.length} Übungen{day.estimatedDurationMin ? ` · ${day.estimatedDurationMin} Min` : ""}
          </span>
          <span className={cn("text-on-surface-variant transition-transform cursor-pointer", open && "rotate-180")} onClick={() => setOpen(!open)}>▾</span>
        </div>
      </div>
      {open && (
        <div className="px-5 pb-4">
          {day.exercises.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-2">Keine Übungen</p>
          ) : (
            <>
              <div className="flex items-center gap-3 pb-2 text-xs font-mono text-on-surface-variant/50">
                <span className="flex-1">Übung</span>
                <span className="w-16 text-right">Sets×Wdh</span>
                <span className="w-16 text-right">Gewicht</span>
                <span className="w-12 text-right">Pause</span>
                <span className="w-24 text-right">Muskelgruppe</span>
              </div>
              {day.exercises.map((ex) => (
                <div key={ex.id} className="flex items-center gap-3 py-2.5 border-b border-outline-variant/5 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface">{parseName(ex.exercise.nameI18n)}</p>
                    {ex.notes && <p className="text-xs text-on-surface-variant mt-0.5 truncate">{ex.notes}</p>}
                  </div>
                  <span className="w-16 text-right text-xs font-mono text-on-surface-variant">
                    {ex.exercise.trackingType === "duration"
                      ? `${ex.sets}×${ex.durationSeconds != null ? (ex.durationSeconds / 60).toFixed(1) : "?"}min`
                      : `${ex.sets}×${repsLabel(ex.repsMin, ex.repsMax)}`}
                  </span>
                  <span className="w-16 text-right text-xs font-mono text-on-surface-variant">{ex.exercise.trackingType === "duration" ? "—" : (ex.suggestedWeightKg ? `${ex.suggestedWeightKg} kg` : "—")}</span>
                  <span className="w-12 text-right text-xs font-mono text-on-surface-variant">{ex.restSeconds ? `${ex.restSeconds}s` : "—"}</span>
                  <span className="w-24 text-right text-xs font-mono text-secondary">{MUSCLE_LABELS[ex.exercise.primaryMuscleGroup] ?? ex.exercise.primaryMuscleGroup}</span>
                </div>
              ))}
            </>
          )}
          {suggestionError && (
            <div className="mt-2 rounded-lg bg-error-container/20 px-3 py-2 text-xs text-error">{suggestionError}</div>
          )}
          {localSuggestion && (
            <SuggestionCard
              dayId={day.id}
              planId={planId}
              currentExercises={day.exercises}
              suggestion={localSuggestion}
              onAccepted={() => { setLocalSuggestion(null); onPlanRefresh(); }}
              onRejected={() => setLocalSuggestion(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────

export default function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDays, setEditDays] = useState<EditDay[]>([]);
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Status updating
  const [statusUpdating, setStatusUpdating] = useState(false);

  const refreshPlan = useCallback(() => {
    fetch(`/api/plans/${planId}`)
      .then(async (r) => { if (!r.ok) throw new Error("Plan nicht gefunden"); return r.json(); })
      .then(setPlan)
      .catch((e) => setFetchError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [planId]);

  useEffect(() => { refreshPlan(); }, [refreshPlan]);

  function enterEditMode() {
    if (!plan) return;
    setEditTitle(plan.title);
    setEditDescription(plan.description ?? "");
    setEditDays(toEditDays(plan.days));
    setSaveError(null);
    setEditMode(true);
    // Lazy-load exercise catalog
    if (catalog.length === 0) {
      fetch("/api/exercises").then((r) => r.json()).then(setCatalog).catch(() => {});
    }
  }

  function cancelEdit() {
    setEditMode(false);
    setSaveError(null);
  }

  async function saveEdit() {
    if (!editTitle.trim()) { setSaveError("Bitte einen Titel eingeben."); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toApiPayload(editTitle, editDescription, editDays)),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Fehler beim Speichern");
      }
      // Reload plan from server
      refreshPlan();
      setEditMode(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function cycleStatus() {
    if (!plan) return;
    const next: Plan["status"] = plan.status === "draft" ? "active" : plan.status === "active" ? "archived" : "draft";
    setStatusUpdating(true);
    await fetch(`/api/plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    setPlan((p) => p ? { ...p, status: next } : p);
    setStatusUpdating(false);
  }

  async function deletePlan() {
    if (!plan || !confirm(`Plan "${plan.title}" wirklich löschen?`)) return;
    await fetch(`/api/plans/${planId}`, { method: "DELETE" });
    router.push("/plans");
  }

  // Edit-mode helpers
  const updateDay = useCallback((uid: string, patch: Partial<Omit<EditDay, "uid" | "exercises">>) => {
    setEditDays((prev) => prev.map((d) => d.uid === uid ? { ...d, ...patch } : d));
  }, []);

  const removeDay = useCallback((uid: string) => {
    setEditDays((prev) => prev.filter((d) => d.uid !== uid));
  }, []);

  const moveDay = useCallback((uid: string, dir: -1 | 1) => {
    setEditDays((prev) => {
      const idx = prev.findIndex((d) => d.uid === uid);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }, []);

  const addExercise = useCallback((dayUid: string, ex: CatalogExercise) => {
    const trackingType = ex.trackingType ?? "weight_reps";
    setEditDays((prev) => prev.map((d) =>
      d.uid === dayUid ? { ...d, exercises: [...d.exercises, { uid: mkId(), exerciseId: ex.id, exerciseName: parseName(ex.nameI18n), primaryMuscleGroup: ex.primaryMuscleGroup, trackingType, sets: 3, repsMin: 8, repsMax: 12, durationSeconds: "", restSeconds: 90, suggestedWeightKg: "", notes: "" }] } : d
    ));
  }, []);

  const updateExercise = useCallback((dayUid: string, exUid: string, patch: Partial<EditExercise>) => {
    setEditDays((prev) => prev.map((d) =>
      d.uid === dayUid ? { ...d, exercises: d.exercises.map((e) => e.uid === exUid ? { ...e, ...patch } : e) } : d
    ));
  }, []);

  const removeExercise = useCallback((dayUid: string, exUid: string) => {
    setEditDays((prev) => prev.map((d) =>
      d.uid === dayUid ? { ...d, exercises: d.exercises.filter((e) => e.uid !== exUid) } : d
    ));
  }, []);

  const reorderExercises = useCallback((dayUid: string, newOrder: EditExercise[]) => {
    setEditDays((prev) => prev.map((d) => d.uid === dayUid ? { ...d, exercises: newOrder } : d));
  }, []);

  // ── Render ─────────────────────────────────────────────────────────

  if (loading) {
    return <div className="h-full flex items-center justify-center text-on-surface-variant">Laden...</div>;
  }
  if (fetchError || !plan) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-on-surface-variant">{fetchError ?? "Plan nicht gefunden"}</p>
        <Button variant="ghost" onClick={() => router.push("/plans")}>Zurück</Button>
      </div>
    );
  }

  const totalExercises = plan.days.reduce((s, d) => s + d.exercises.length, 0);

  return (
    <div className="h-full overflow-y-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b border-outline-variant/10 bg-surface/90 backdrop-blur-sm px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <button
            onClick={() => (editMode ? cancelEdit() : router.push("/plans"))}
            className="text-xs font-mono text-on-surface-variant hover:text-on-surface transition-colors"
          >
            {editMode ? "← Abbrechen" : "← Alle Pläne"}
          </button>
          <span className="text-on-surface-variant/30">|</span>
          {editMode ? (
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="flex-1 bg-transparent font-headline text-sm font-bold text-on-surface outline-none border-b border-primary/40 focus:border-primary transition-colors"
              placeholder="Plan-Titel"
            />
          ) : (
            <span className="font-headline text-sm font-bold text-on-surface truncate">{plan.title}</span>
          )}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {editMode ? (
              <Button size="sm" onClick={saveEdit} isLoading={saving}>Speichern</Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={enterEditMode}>Bearbeiten</Button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col gap-5 pb-24">

        {/* Read mode: status + stats */}
        {!editMode && (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn("text-xs font-mono font-bold uppercase px-2 py-0.5 rounded-full", STATUS_COLORS[plan.status])}>
                    {STATUS_LABELS[plan.status]}
                  </span>
                  {plan.aiGenerated && <span className="text-xs font-mono text-on-surface-variant/50">KI-Generiert</span>}
                </div>
                <h1 className="font-headline text-2xl font-bold text-on-surface">{plan.title}</h1>
                {plan.description && <p className="text-sm text-on-surface-variant mt-1">{plan.description}</p>}
              </div>
            </div>
            <div className="flex gap-6 text-xs font-mono text-on-surface-variant">
              <div><span className="text-on-surface-variant/50">Trainingstage</span><p className="text-on-surface">{plan.days.length}</p></div>
              <div><span className="text-on-surface-variant/50">Übungen gesamt</span><p className="text-on-surface">{totalExercises}</p></div>
              <div><span className="text-on-surface-variant/50">Erstellt</span><p className="text-on-surface">{new Date(plan.createdAt).toLocaleDateString("de-DE")}</p></div>
            </div>
          </>
        )}

        {/* Edit mode: description field */}
        {editMode && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">Beschreibung</label>
            <textarea
              rows={2}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Optionale Beschreibung..."
              className="w-full rounded-md bg-surface-container-highest px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 border-0 outline-none transition-all resize-none focus:bg-surface-bright"
            />
          </div>
        )}

        {/* Days */}
        <div className="flex flex-col gap-3">
          {editMode ? (
            <>
              {editDays.map((day, i) => (
                <EditDaySection
                  key={day.uid}
                  day={day}
                  dayIndex={i}
                  totalDays={editDays.length}
                  catalog={catalog}
                  onUpdate={(patch) => updateDay(day.uid, patch)}
                  onRemove={() => removeDay(day.uid)}
                  onMoveUp={() => moveDay(day.uid, -1)}
                  onMoveDown={() => moveDay(day.uid, 1)}
                  onAddExercise={(ex) => addExercise(day.uid, ex)}
                  onUpdateExercise={(exUid, patch) => updateExercise(day.uid, exUid, patch)}
                  onRemoveExercise={(exUid) => removeExercise(day.uid, exUid)}
                  onReorderExercises={(newOrder) => reorderExercises(day.uid, newOrder)}
                />
              ))}
              <button
                onClick={() => setEditDays((prev) => [...prev, { uid: mkId(), title: `Tag ${prev.length + 1}`, focus: "", estimatedDurationMin: "", exercises: [] }])}
                className="rounded-xl border-2 border-dashed border-outline-variant/20 py-4 text-sm text-on-surface-variant hover:border-primary/30 hover:text-primary transition-all"
              >
                + Trainingstag hinzufügen
              </button>
              {saveError && (
                <div className="rounded-lg bg-error-container/20 px-4 py-3 text-sm text-error">{saveError}</div>
              )}
            </>
          ) : (
            plan.days.map((day) => <DaySection key={day.id} day={day} planId={planId} onPlanRefresh={refreshPlan} />)
          )}
        </div>

        {/* Read-mode action bar */}
        {!editMode && (
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={cycleStatus} isLoading={statusUpdating}>
              {plan.status === "active" ? "Deaktivieren" : plan.status === "archived" ? "Als Entwurf" : "Aktivieren"}
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" onClick={deletePlan}>Löschen</Button>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWorkoutStore } from "@/stores/workout-store";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils/cn";

// ── Types ──────────────────────────────────────────────────────────────

type EventType = "training_day" | "rest" | "cardio" | "custom";

type TrainingDay = {
  id: string; title: string; focus: string | null; estimatedDurationMin: number | null;
};

type ScheduledEvent = {
  id: string; eventType: EventType; scheduledDate: string;
  title: string | null; notes: string | null; isCompleted: boolean;
  trainingDayId: string | null; trainingDay: TrainingDay | null;
};

type PlanDay = {
  id: string; title: string; focus: string | null;
  estimatedDurationMin: number | null; sortOrder: number;
  exercises: unknown[];
};

type Plan = { id: string; title: string; status: string; days: PlanDay[] };

type DragData =
  | { kind: "plan-day"; trainingDayId: string; title: string; focus: string | null; colorIdx: number }
  | { kind: "rest" }
  | { kind: "cardio" }
  | { kind: "event"; eventId: string; eventType: EventType; title: string | null; colorIdx?: number };

// ── Color palette for training days ───────────────────────────────────
// Each entry: sidebar chip style | calendar event chip style | dot

type DayColor = {
  chip: string;       // sidebar chip classes
  chipHover: string;  // hover state for sidebar
  event: string;      // calendar event chip classes
  dot: string;        // colored dot
  label: string;      // accent for event detail heading
};

const DAY_PALETTE: DayColor[] = [
  {
    chip:      "bg-primary-container/15 text-primary",
    chipHover: "hover:bg-primary-container/25",
    event:     "bg-primary-container/25 text-primary",
    dot:       "bg-primary",
    label:     "text-primary",
  },
  {
    chip:      "bg-secondary-container/15 text-secondary",
    chipHover: "hover:bg-secondary-container/25",
    event:     "bg-secondary-container/25 text-secondary",
    dot:       "bg-secondary",
    label:     "text-secondary",
  },
  {
    chip:      "bg-orange-500/15 text-orange-400",
    chipHover: "hover:bg-orange-500/25",
    event:     "bg-orange-500/20 text-orange-400",
    dot:       "bg-orange-400",
    label:     "text-orange-400",
  },
  {
    chip:      "bg-violet-500/15 text-violet-400",
    chipHover: "hover:bg-violet-500/25",
    event:     "bg-violet-500/20 text-violet-400",
    dot:       "bg-violet-400",
    label:     "text-violet-400",
  },
  {
    chip:      "bg-rose-500/15 text-rose-400",
    chipHover: "hover:bg-rose-500/25",
    event:     "bg-rose-500/20 text-rose-400",
    dot:       "bg-rose-400",
    label:     "text-rose-400",
  },
  {
    chip:      "bg-emerald-500/15 text-emerald-400",
    chipHover: "hover:bg-emerald-500/25",
    event:     "bg-emerald-500/20 text-emerald-400",
    dot:       "bg-emerald-400",
    label:     "text-emerald-400",
  },
  {
    chip:      "bg-amber-500/15 text-amber-400",
    chipHover: "hover:bg-amber-500/25",
    event:     "bg-amber-500/20 text-amber-400",
    dot:       "bg-amber-400",
    label:     "text-amber-400",
  },
];

// Fixed colors for non-training-day event types
const EVENT_STATIC: Record<Exclude<EventType, "training_day">, DayColor> = {
  rest: {
    chip: "bg-surface-container text-on-surface-variant",
    chipHover: "hover:bg-surface-container-high",
    event: "bg-surface-container-highest text-on-surface-variant",
    dot: "bg-on-surface-variant/40",
    label: "text-on-surface-variant",
  },
  cardio: {
    chip: "bg-secondary-container/20 text-secondary",
    chipHover: "hover:bg-secondary-container/30",
    event: "bg-secondary-container/25 text-secondary",
    dot: "bg-secondary",
    label: "text-secondary",
  },
  custom: {
    chip: "bg-tertiary-container/20 text-tertiary",
    chipHover: "hover:bg-tertiary-container/30",
    event: "bg-tertiary-container/25 text-tertiary",
    dot: "bg-tertiary",
    label: "text-tertiary",
  },
};

// keyed by trainingDayId
type DayColorMap = Record<string, DayColor>;

// ── Date helpers ───────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getCalendarDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Mon = 0
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) =>
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
  );
}

const MONTHS_DE = [
  "Januar","Februar","März","April","Mai","Juni",
  "Juli","August","September","Oktober","November","Dezember",
];
const DAYS_DE = ["Mo","Di","Mi","Do","Fr","Sa","So"];

// ── Helpers ────────────────────────────────────────────────────────────

function getEventColor(event: ScheduledEvent, dayColorMap: DayColorMap): DayColor {
  if (event.eventType === "training_day" && event.trainingDayId) {
    return dayColorMap[event.trainingDayId] ?? DAY_PALETTE[0];
  }
  return EVENT_STATIC[event.eventType as Exclude<EventType, "training_day">] ?? EVENT_STATIC.custom;
}

function eventLabel(event: ScheduledEvent): string {
  if (event.eventType === "training_day") return event.trainingDay?.title ?? event.title ?? "Training";
  if (event.eventType === "rest") return "Ruhetag";
  if (event.eventType === "cardio") return event.title ?? "Cardio";
  return event.title ?? "Custom";
}

// ── Draggable sidebar chip ─────────────────────────────────────────────

function DraggableChip({ id, data, color, children }: {
  id: string; data: DragData; color: DayColor; children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab active:cursor-grabbing touch-none select-none rounded-lg px-3 py-2.5 transition-colors",
        color.chip, color.chipHover,
        isDragging && "opacity-40"
      )}
    >
      {children}
    </div>
  );
}

// ── Draggable event chip (on calendar) ────────────────────────────────

function EventChip({ event, dayColorMap, onSelect }: {
  event: ScheduledEvent; dayColorMap: DayColorMap; onSelect: (e: ScheduledEvent) => void;
}) {
  const color = getEventColor(event, dayColorMap);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `event-${event.id}`,
    data: {
      kind: "event",
      eventId: event.id,
      eventType: event.eventType,
      title: event.title,
      colorIdx: event.trainingDayId
        ? Object.keys(dayColorMap).indexOf(event.trainingDayId)
        : undefined,
    } satisfies DragData,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => { e.stopPropagation(); onSelect(event); }}
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium truncate max-w-full",
        "cursor-grab active:cursor-grabbing touch-none",
        color.event,
        event.isCompleted && "opacity-50 line-through",
        isDragging && "opacity-40"
      )}
    >
      <span className={cn("shrink-0 h-1.5 w-1.5 rounded-full", color.dot)} />
      <span className="truncate">{eventLabel(event)}</span>
    </div>
  );
}

// ── Droppable calendar cell ────────────────────────────────────────────

function CalendarCell({ date, events, isCurrentMonth, dayColorMap, onSelectEvent }: {
  date: Date; events: ScheduledEvent[]; isCurrentMonth: boolean;
  dayColorMap: DayColorMap; onSelectEvent: (e: ScheduledEvent) => void;
}) {
  const dateStr = toDateStr(date);
  const isToday = dateStr === toDateStr(new Date());
  const { setNodeRef, isOver } = useDroppable({ id: dateStr });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-20 p-1 flex flex-col gap-0.5 border-b border-r border-outline-variant/10 transition-colors",
        !isCurrentMonth && "bg-surface-container/30",
        isOver && "bg-primary/5 ring-1 ring-inset ring-primary/20",
      )}
    >
      <span className={cn(
        "self-start flex h-6 w-6 items-center justify-center rounded-full text-xs font-mono shrink-0",
        isToday
          ? "bg-primary text-on-primary font-bold"
          : isCurrentMonth ? "text-on-surface" : "text-on-surface-variant/30"
      )}>
        {date.getDate()}
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        {events.map((ev) => (
          <EventChip key={ev.id} event={ev} dayColorMap={dayColorMap} onSelect={onSelectEvent} />
        ))}
      </div>
    </div>
  );
}

// ── Event detail popover ───────────────────────────────────────────────

function EventDetail({ event, dayColorMap, onClose, onDelete, onToggleComplete }: {
  event: ScheduledEvent; dayColorMap: DayColorMap;
  onClose: () => void;
  onDelete: (id: string) => void;
  onToggleComplete: (id: string, done: boolean) => void;
}) {
  const color = getEventColor(event, dayColorMap);
  const router = useRouter();
  const { startWorkout } = useWorkoutStore();
  const [starting, setStarting] = useState(false);
  const [linkedSessionId, setLinkedSessionId] = useState<string | null | undefined>(undefined); // undefined = not loaded yet

  // Load linked session when a completed training event is opened
  useEffect(() => {
    if (event.eventType !== "training_day" || !event.isCompleted) return;
    fetch(`/api/workout/sessions?scheduledEventId=${event.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setLinkedSessionId(data?.id ?? null));
  }, [event.id, event.eventType, event.isCompleted]);

  async function handleStartWorkout() {
    if (event.eventType !== "training_day") return;
    setStarting(true);
    try {
      const res = await fetch("/api/workout/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: eventLabel(event),
          trainingDayId: event.trainingDayId,
          scheduledEventId: event.id,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exercises = (data.exercises ?? []).map((ex: any) => ({ ...ex, loggedSets: [] }));
      startWorkout({
        sessionId: data.id,
        title: data.title,
        trainingDayId: data.trainingDayId ?? null,
        startedAt: data.startedAt,
        exercises,
      });
      onClose();
      router.push(`/workout/${data.id}`);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-72 rounded-xl bg-surface-container-high p-5 flex flex-col gap-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className={cn("h-2 w-2 rounded-full shrink-0", color.dot)} />
              <span className={cn("text-xs font-mono uppercase", color.label)}>
                {event.eventType === "training_day" ? "Training" : event.eventType === "rest" ? "Ruhetag" : event.eventType === "cardio" ? "Cardio" : "Custom"}
              </span>
            </div>
            <h3 className="font-headline font-bold text-on-surface">{eventLabel(event)}</h3>
            {event.trainingDay?.focus && (
              <p className="text-xs text-on-surface-variant mt-0.5">{event.trainingDay.focus}</p>
            )}
            <p className="text-xs text-on-surface-variant mt-1 font-mono">
              {new Date(event.scheduledDate + "T00:00:00").toLocaleDateString("de-DE", {
                weekday: "long", day: "numeric", month: "long",
              })}
            </p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant/50 hover:text-on-surface transition-colors">✕</button>
        </div>
        <div className="flex flex-col gap-2">
          {event.eventType === "training_day" && !event.isCompleted && (
            <button
              onClick={handleStartWorkout}
              disabled={starting}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-bold bg-primary text-on-primary hover:opacity-90 transition-all disabled:opacity-50"
            >
              {starting ? "Starten…" : "Training starten ▶"}
            </button>
          )}
          {event.eventType === "training_day" && event.isCompleted && linkedSessionId && (
            <button
              onClick={() => { onClose(); router.push(`/workout/${linkedSessionId}/detail`); }}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-bold bg-secondary-container/30 text-secondary hover:bg-secondary-container/50 transition-all"
            >
              Training anzeigen →
            </button>
          )}
          <button
            onClick={() => { onToggleComplete(event.id, !event.isCompleted); onClose(); }}
            className={cn(
              "w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
              event.isCompleted
                ? "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                : "bg-secondary-container/30 text-secondary hover:bg-secondary-container/50"
            )}
          >
            {event.isCompleted ? "Als offen markieren" : "Als erledigt markieren ✓"}
          </button>
          <button
            onClick={() => { onDelete(event.id); onClose(); }}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-error hover:bg-error-container/20 transition-all"
          >
            Löschen
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Overlay chip (shown while dragging) ───────────────────────────────

function OverlayChip({ data, dayColorMap }: { data: DragData; dayColorMap: DayColorMap }) {
  let color: DayColor;
  let label: string;

  if (data.kind === "plan-day") {
    color = dayColorMap[data.trainingDayId] ?? DAY_PALETTE[0];
    label = data.title;
  } else if (data.kind === "rest") {
    color = EVENT_STATIC.rest;
    label = "Ruhetag";
  } else if (data.kind === "cardio") {
    color = EVENT_STATIC.cardio;
    label = "Cardio";
  } else {
    // event
    color = (data.colorIdx !== undefined && data.colorIdx >= 0)
      ? DAY_PALETTE[data.colorIdx % DAY_PALETTE.length]
      : EVENT_STATIC.custom;
    label = data.title ?? "Event";
  }

  return (
    <div className={cn(
      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-xl",
      color.event
    )}>
      <span className={cn("h-2 w-2 rounded-full shrink-0", color.dot)} />
      {label}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });
  const [events, setEvents] = useState<ScheduledEvent[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeDragData, setActiveDragData] = useState<DragData | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<ScheduledEvent | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const calDays = getCalendarDays(year, month);
  const from = toDateStr(calDays[0]);
  const to   = toDateStr(calDays[calDays.length - 1]);

  // Stable color map: trainingDayId → DayColor (by position in plan)
  const dayColorMap: DayColorMap = {};
  if (activePlan) {
    activePlan.days.forEach((d, i) => {
      dayColorMap[d.id] = DAY_PALETTE[i % DAY_PALETTE.length];
    });
  }

  const loadEvents = useCallback(async (f: string, t: string) => {
    const res = await fetch(`/api/scheduled-events?from=${f}&to=${t}`);
    if (res.ok) setEvents(await res.json());
  }, []);

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => r.json())
      .then((plans: Plan[]) => setActivePlan(plans.find((p) => p.status === "active") ?? null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadEvents(from, to); }, [from, to, loadEvents]);

  function prevMonth() { setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)); }
  function nextMonth() { setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)); }

  function handleDragStart(e: DragStartEvent) {
    setActiveDragData(e.active.data.current as DragData);
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveDragData(null);
    const { active, over } = e;
    if (!over) return;

    const targetDate = over.id as string;
    const data = active.data.current as DragData;

    if (data.kind === "event") {
      setEvents((prev) => prev.map((ev) =>
        ev.id === data.eventId ? { ...ev, scheduledDate: targetDate } : ev
      ));
      await fetch(`/api/scheduled-events/${data.eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledDate: targetDate }),
      });
    } else {
      const payload = {
        eventType: data.kind === "plan-day" ? "training_day" : data.kind,
        trainingDayId: data.kind === "plan-day" ? data.trainingDayId : null,
        scheduledDate: targetDate,
        title: data.kind === "plan-day" ? data.title
             : data.kind === "cardio"   ? "Cardio"
             : "Ruhetag",
      };
      const res = await fetch("/api/scheduled-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        setEvents((prev) => [...prev, created]);
      }
    }
  }

  async function handleDelete(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    await fetch(`/api/scheduled-events/${id}`, { method: "DELETE" });
  }

  async function handleToggleComplete(id: string, done: boolean) {
    setEvents((prev) => prev.map((e) => e.id === id ? { ...e, isCompleted: done } : e));
    await fetch(`/api/scheduled-events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCompleted: done }),
    });
  }

  const eventsByDate = events.reduce<Record<string, ScheduledEvent[]>>((acc, ev) => {
    (acc[ev.scheduledDate] ??= []).push(ev);
    return acc;
  }, {});

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragData(null)}
    >
      <div className="flex h-full overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="w-56 shrink-0 flex flex-col gap-5 overflow-y-auto border-r border-outline-variant/10 bg-surface-container-low p-4">

          <div>
            <p className="mb-2 text-xs font-mono uppercase tracking-wider text-on-surface-variant/60">
              Schnell-Aktionen
            </p>
            <div className="flex flex-col gap-2">
              <DraggableChip id="drag-rest" data={{ kind: "rest" }} color={EVENT_STATIC.rest}>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-on-surface-variant/40" />
                  <span className="text-sm font-medium">Ruhetag</span>
                </div>
              </DraggableChip>
              <DraggableChip id="drag-cardio" data={{ kind: "cardio" }} color={EVENT_STATIC.cardio}>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-secondary" />
                  <span className="text-sm font-medium">Cardio</span>
                </div>
              </DraggableChip>
            </div>
          </div>

          <div className="flex-1">
            <p className="mb-2 text-xs font-mono uppercase tracking-wider text-on-surface-variant/60">
              Aktiver Plan
            </p>
            {loading ? (
              <p className="text-xs text-on-surface-variant/50">Laden…</p>
            ) : !activePlan ? (
              <p className="text-xs text-on-surface-variant/50">
                Kein aktiver Plan. Aktiviere einen Plan unter Trainingspläne.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <p className="mb-1 text-xs font-medium text-on-surface truncate">{activePlan.title}</p>
                {activePlan.days.map((day, i) => {
                  const color = DAY_PALETTE[i % DAY_PALETTE.length];
                  return (
                    <DraggableChip
                      key={day.id}
                      id={`drag-day-${day.id}`}
                      data={{ kind: "plan-day", trainingDayId: day.id, title: day.title, focus: day.focus, colorIdx: i }}
                      color={color}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn("h-2 w-2 rounded-full shrink-0", color.dot)} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{day.title}</p>
                          {day.focus && <p className="text-xs opacity-60 truncate">{day.focus}</p>}
                        </div>
                      </div>
                    </DraggableChip>
                  );
                })}
              </div>
            )}
          </div>

          <p className="text-xs text-on-surface-variant/40 text-center pb-1">
            Ziehe auf einen Kalendertag
          </p>
        </aside>

        {/* ── Calendar ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Month nav */}
          <div className="shrink-0 flex items-center justify-between border-b border-outline-variant/10 px-5 py-3">
            <button
              onClick={prevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all"
            >
              ←
            </button>
            <span className="font-headline font-bold text-on-surface">
              {MONTHS_DE[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all"
            >
              →
            </button>
          </div>

          {/* Day headers */}
          <div className="shrink-0 grid grid-cols-7 border-b border-outline-variant/10">
            {DAYS_DE.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-mono uppercase tracking-wider text-on-surface-variant/50">
                {d}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-7 border-l border-t border-outline-variant/10">
              {calDays.map((date) => {
                const ds = toDateStr(date);
                return (
                  <CalendarCell
                    key={ds}
                    date={date}
                    events={eventsByDate[ds] ?? []}
                    isCurrentMonth={date.getMonth() === month}
                    dayColorMap={dayColorMap}
                    onSelectEvent={setSelectedEvent}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDragData && <OverlayChip data={activeDragData} dayColorMap={dayColorMap} />}
      </DragOverlay>

      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          dayColorMap={dayColorMap}
          onClose={() => setSelectedEvent(null)}
          onDelete={handleDelete}
          onToggleComplete={handleToggleComplete}
        />
      )}
    </DndContext>
  );
}

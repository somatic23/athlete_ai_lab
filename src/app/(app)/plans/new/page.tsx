"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { isTextUIPart } from "ai";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import type { GeneratedPlan } from "@/lib/ai/plan-schema";

// ── Types ──────────────────────────────────────────────────────────────

type Stage = "idle" | "chat" | "generating" | "review" | "saving";

// ── Markdown renderer (shared with coach page) ─────────────────────────

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-semibold text-on-surface">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="rounded bg-surface-container-highest px-1 py-0.5 font-mono text-xs text-primary">{part.slice(1, -1)}</code>;
    return part;
  });
}

function MarkdownText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## ")) return <p key={i} className="font-headline font-semibold text-on-surface mt-2 first:mt-0">{renderInline(line.slice(3))}</p>;
        if (line.startsWith("# "))  return <p key={i} className="font-headline font-bold text-on-surface mt-2 first:mt-0">{renderInline(line.slice(2))}</p>;
        if (line.startsWith("- ") || line.startsWith("* "))
          return <div key={i} className="flex gap-2"><span className="mt-px shrink-0 text-primary">·</span><span>{renderInline(line.slice(2))}</span></div>;
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

// ── Plan review sub-components ─────────────────────────────────────────

function ExerciseRow({ ex }: {
  ex: {
    exerciseId: string;
    exerciseName: string;
    sets: number;
    reps: string;
    weightSuggestion: string;
    restSeconds: number;
    notes: string;
  }
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-outline-variant/5 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-on-surface">{ex.exerciseName}</p>
        {ex.notes && <p className="text-xs text-on-surface-variant mt-0.5">{ex.notes}</p>}
      </div>
      <div className="flex gap-3 text-xs font-mono text-on-surface-variant shrink-0">
        <span className="w-12 text-right">{ex.sets}×{ex.reps}</span>
        <span className="w-20 text-right text-secondary">{ex.weightSuggestion}</span>
        <span className="w-12 text-right">{ex.restSeconds}s</span>
      </div>
    </div>
  );
}

function DayCard({ day, index }: { day: GeneratedPlan["trainingDays"][number]; index: number }) {
  const [open, setOpen] = useState(index === 0);
  return (
    <div className="rounded-xl bg-surface-container overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-surface-container-high transition-colors"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-on-surface-variant/50">Tag {index + 1}</span>
            <span className="text-xs font-mono text-secondary">{day.focus}</span>
          </div>
          <h4 className="font-headline font-bold text-on-surface mt-0.5">{day.dayName}</h4>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-mono text-on-surface-variant">
            {day.exercises.length} Uebungen · {day.estimatedDurationMinutes} Min
          </span>
          <span className={cn("text-on-surface-variant transition-transform", open && "rotate-180")}>▾</span>
        </div>
      </button>
      {open && (
        <div className="px-5 pb-4">
          <div className="flex gap-3 pb-2 text-xs font-mono text-on-surface-variant/50">
            <span className="flex-1">Uebung</span>
            <span className="w-12 text-right">Sets×Wdh</span>
            <span className="w-20 text-right">Gewicht</span>
            <span className="w-12 text-right">Pause</span>
          </div>
          {day.exercises.map((ex) => <ExerciseRow key={ex.exerciseId} ex={ex} />)}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────

export default function NewPlanPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");

  const { messages, sendMessage, status } = useChat();
  const isStreaming = status === "streaming" || status === "submitted";

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  function startChat() {
    setStage("chat");
    // Trigger Atlas to begin the plan creation interview
    sendMessage({ text: "Ich möchte einen neuen Trainingsplan erstellen." });
  }

  function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    sendMessage({ text });
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function generatePlan() {
    setStage("generating");
    setError(null);
    try {
      const res = await fetch("/api/plan/generate", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Fehler beim Generieren");
      }
      const data: GeneratedPlan = await res.json();
      setPlan(data);
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("chat");
    }
  }

  async function savePlan() {
    if (!plan) return;
    setStage("saving");
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Fehler beim Speichern");
      }
      const saved = await res.json();
      router.push(`/plans/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("review");
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-outline-variant/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/plans")}
            className="text-xs font-mono text-on-surface-variant hover:text-on-surface transition-colors"
          >
            ← Plaene
          </button>
          <span className="text-on-surface-variant/30">|</span>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-container/20">
              <span className="font-headline text-xs font-bold text-primary">A</span>
            </div>
            <div>
              <span className="font-headline text-sm font-bold text-on-surface">Atlas</span>
              <span className="ml-2 text-xs text-on-surface-variant">Planersteller</span>
            </div>
          </div>
          {stage === "chat" && (
            <div className="ml-auto flex items-center gap-1.5">
              <span className={cn(
                "h-2 w-2 rounded-full transition-colors",
                isStreaming ? "bg-primary animate-pulse" : "bg-secondary"
              )} />
              <span className="text-xs text-on-surface-variant">
                {isStreaming ? "Antwortet..." : "Bereit"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* ── Idle ── */}
        {stage === "idle" && (
          <div className="flex h-full items-center justify-center p-6">
            <div className="w-full max-w-md">
              <h2 className="font-headline text-xl font-bold text-on-surface text-center mb-2">
                Neuen Plan erstellen
              </h2>
              <p className="text-sm text-on-surface-variant text-center mb-8">
                Wähle, wie du deinen Trainingsplan erstellen möchtest.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {/* AI option */}
                <button
                  onClick={startChat}
                  className="group rounded-xl bg-surface-container p-6 text-left transition-all hover:bg-primary-container/10 hover:ring-1 hover:ring-primary/20"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-container/20 transition-colors group-hover:bg-primary-container/30">
                    <span className="font-headline text-xl font-bold text-primary">A</span>
                  </div>
                  <h3 className="font-headline font-bold text-on-surface">Mit AI erstellen</h3>
                  <p className="mt-1.5 text-xs text-on-surface-variant">
                    Atlas stellt dir Fragen und generiert einen personalisierten Plan.
                  </p>
                </button>

                {/* Manual option */}
                <Link
                  href="/plans/new/manual"
                  className="group rounded-xl bg-surface-container p-6 text-left transition-all hover:bg-secondary-container/10 hover:ring-1 hover:ring-secondary/20"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary-container/20 transition-colors group-hover:bg-secondary-container/30">
                    <span className="text-xl text-secondary">▦</span>
                  </div>
                  <h3 className="font-headline font-bold text-on-surface">Manuell erstellen</h3>
                  <p className="mt-1.5 text-xs text-on-surface-variant">
                    Lege Trainingstage und Übungen selbst fest.
                  </p>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── Chat ── */}
        {stage === "chat" && (
          <div className="mx-auto max-w-2xl flex flex-col gap-4 px-4 py-6">
            {messages.map((msg) => {
              const textContent = msg.parts.filter(isTextUIPart).map((p) => p.text).join("");
              if (!textContent) return null;
              return (
                <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && (
                    <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-container/20">
                      <span className="font-headline text-xs font-bold text-primary">A</span>
                    </div>
                  )}
                  <div className={cn(
                    "max-w-[80%] rounded-xl px-4 py-3 text-sm",
                    msg.role === "user"
                      ? "bg-primary-container text-on-primary rounded-br-sm"
                      : "bg-surface-container text-on-surface rounded-bl-sm"
                  )}>
                    {msg.role === "assistant"
                      ? <MarkdownText text={textContent} />
                      : <p className="whitespace-pre-wrap">{textContent}</p>}
                    {msg.role === "assistant" && isStreaming && msg === messages[messages.length - 1] && (
                      <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary align-middle" />
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}

        {/* ── Generating ── */}
        {stage === "generating" && (
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <div className="relative">
              <div className="h-16 w-16 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl">◈</span>
              </div>
            </div>
            <div className="text-center">
              <p className="font-headline font-bold text-on-surface">Plan wird generiert...</p>
              <p className="text-sm text-on-surface-variant mt-1">Atlas erstellt deinen personalisierten Plan</p>
            </div>
          </div>
        )}

        {/* ── Review ── */}
        {(stage === "review" || stage === "saving") && plan && (
          <div className="mx-auto max-w-2xl p-6 flex flex-col gap-4 pb-32">
            {/* Plan header */}
            <div className="rounded-xl bg-primary-container/10 border border-primary/10 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-headline text-xl font-bold text-on-surface">{plan.planName}</h2>
                  <p className="text-sm text-on-surface-variant mt-1">{plan.goal}</p>
                </div>
                <span className="shrink-0 text-xs font-mono uppercase text-primary bg-primary-container/30 px-2 py-1 rounded-full">
                  KI-Generiert
                </span>
              </div>
              <div className="flex flex-wrap gap-6 mt-4 text-xs font-mono">
                <div>
                  <span className="text-on-surface-variant/60">Dauer</span>
                  <p className="text-on-surface font-medium">{plan.durationWeeks} Wochen</p>
                </div>
                <div>
                  <span className="text-on-surface-variant/60">Trainingstage</span>
                  <p className="text-on-surface font-medium">{plan.trainingDaysPerWeek}× / Woche</p>
                </div>
                <div>
                  <span className="text-on-surface-variant/60">Level</span>
                  <p className="text-on-surface font-medium capitalize">{plan.experienceLevel}</p>
                </div>
              </div>
            </div>

            {plan.trainingDays.map((day, i) => (
              <DayCard key={i} day={day} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      {stage === "chat" && (
        <div className="shrink-0 border-t border-outline-variant/10 bg-surface/80 backdrop-blur-sm px-4 py-4">
          {error && (
            <div className="mx-auto max-w-2xl mb-3 rounded-lg bg-error-container/20 px-3 py-2 text-xs text-error">
              {error}
            </div>
          )}
          <div className="mx-auto max-w-2xl flex flex-col gap-3">
            {/* Generate button — visible after first exchange */}
            {hasMessages && !isStreaming && (
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={generatePlan}>
                  Plan generieren →
                </Button>
              </div>
            )}
            {/* Chat input */}
            <form onSubmit={handleSend} className="flex items-end gap-3">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Antworte Atlas..."
                rows={1}
                className="hide-scrollbar flex-1 resize-none rounded-xl bg-surface-container px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none transition-all focus:bg-surface-container-high"
              />
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
                  input.trim() && !isStreaming
                    ? "bg-primary text-on-primary hover:opacity-90"
                    : "bg-surface-container text-on-surface-variant opacity-50 cursor-not-allowed"
                )}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M14 8L2 2L5 8L2 14L14 8Z" fill="currentColor" />
                </svg>
              </button>
            </form>
            <p className="text-center text-xs text-on-surface-variant/50">
              Enter zum Senden · Shift+Enter für neue Zeile
            </p>
          </div>
        </div>
      )}

      {/* Review action bar */}
      {(stage === "review" || stage === "saving") && plan && (
        <div className="shrink-0 border-t border-outline-variant/10 bg-surface/80 backdrop-blur-sm px-4 py-4">
          {error && (
            <div className="mx-auto max-w-2xl mb-3 rounded-lg bg-error-container/20 px-3 py-2 text-xs text-error">
              {error}
            </div>
          )}
          <div className="mx-auto max-w-2xl flex gap-3">
            <Button onClick={savePlan} isLoading={stage === "saving"} className="flex-1">
              Plan speichern
            </Button>
            <Button variant="ghost" onClick={() => setStage("chat")} disabled={stage === "saving"}>
              Weiter bearbeiten
            </Button>
            <Button variant="ghost" onClick={() => { setPlan(null); setStage("chat"); }} disabled={stage === "saving"}>
              Verwerfen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

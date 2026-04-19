"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getPersonality } from "@/lib/coach-personalities";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart, isToolUIPart, getToolName } from "ai";
import type { UIMessage } from "ai";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import type { GeneratedPlan } from "@/lib/ai/plan-schema";
import type { PlanProposal } from "@/lib/ai/plan-tool";

// ── Types ──────────────────────────────────────────────────────────────

type Stage = "idle" | "chat";

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

// ── Plan preview sub-components ────────────────────────────────────────

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

function DayCard({ day, index, defaultOpen }: {
  day: GeneratedPlan["trainingDays"][number];
  index: number;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl bg-surface-container-high overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-surface-container-highest transition-colors"
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

function PlanProposalCard({
  plan,
  active,
  saving,
  onAccept,
  onRevise,
}: {
  plan: PlanProposal;
  active: boolean;
  saving: boolean;
  onAccept: () => void;
  onRevise: () => void;
}) {
  return (
    <div className={cn(
      "rounded-2xl border p-5 transition-opacity",
      active
        ? "bg-primary-container/10 border-primary/20"
        : "bg-surface-container/50 border-outline-variant/10 opacity-60"
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-wider text-primary bg-primary-container/30 px-2 py-0.5 rounded-full">
              Planvorschlag
            </span>
            {!active && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full">
                Ersetzt
              </span>
            )}
          </div>
          <h3 className="font-headline text-lg font-bold text-on-surface mt-2">{plan.planName}</h3>
          <p className="text-sm text-on-surface-variant mt-0.5">{plan.goal}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-5 mt-3 text-xs font-mono">
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

      {plan.coachNotes && (
        <div className="mt-4 rounded-lg bg-surface-container/70 px-3 py-2.5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant/60 mb-1">
            Hinweise vom Coach
          </p>
          <p className="text-xs text-on-surface-variant leading-relaxed whitespace-pre-wrap">
            {plan.coachNotes}
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {plan.trainingDays.map((day, i) => (
          <DayCard key={i} day={day} index={i} defaultOpen={active && i === 0} />
        ))}
      </div>

      {active && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button onClick={onAccept} isLoading={saving} className="flex-1 min-w-[160px]">
            Plan übernehmen
          </Button>
          <Button variant="ghost" onClick={onRevise} disabled={saving}>
            Anpassungen besprechen
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────

type MessageParts = UIMessage["parts"];

function isProposeTrainingPlanPart(part: MessageParts[number]): boolean {
  return isToolUIPart(part) && getToolName(part) === "proposeTrainingPlan";
}

export default function NewPlanPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [coachName, setCoachName] = useState("Atlas");

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p) => { if (p.coachPersonality) setCoachName(getPersonality(p.coachPersonality).label); })
      .catch(() => {});
  }, []);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/plan/chat" }),
  });
  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  // Find the last completed plan proposal tool call — that's the "active" one.
  const lastProposalKey = (() => {
    for (let m = messages.length - 1; m >= 0; m--) {
      const parts = messages[m].parts;
      for (let p = parts.length - 1; p >= 0; p--) {
        const part = parts[p];
        if (
          isProposeTrainingPlanPart(part) &&
          isToolUIPart(part) &&
          (part.state === "input-available" || part.state === "output-available")
        ) {
          return `${messages[m].id}:${p}`;
        }
      }
    }
    return null;
  })();

  function startChat() {
    setStage("chat");
    sendMessage({
      text:
        "Ich möchte gemeinsam mit dir einen neuen Trainingsplan erstellen. Bitte führe ein kurzes Interview mit mir — stelle mir eine Frage nach der anderen und rufe das Tool erst auf, wenn du alle wichtigen Infos hast.",
    });
  }

  function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isStreaming || saving) return;
    sendMessage({ text });
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function acceptPlan(proposal: PlanProposal) {
    setSaving(true);
    setError(null);
    try {
      // Strip coachNotes — /api/plans expects the GeneratedPlan shape.
      const { coachNotes: _coachNotes, ...plan } = proposal;
      void _coachNotes;
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Fehler beim Speichern");
      }
      const saved = await res.json();
      router.push(`/plans/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  function reviseProposal() {
    textareaRef.current?.focus();
  }

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
              <span className="font-headline text-xs font-bold text-primary">{coachName[0]}</span>
            </div>
            <div>
              <span className="font-headline text-sm font-bold text-on-surface">{coachName}</span>
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
                <button
                  onClick={startChat}
                  className="group rounded-xl bg-surface-container p-6 text-left transition-all hover:bg-primary-container/10 hover:ring-1 hover:ring-primary/20"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-container/20 transition-colors group-hover:bg-primary-container/30">
                    <span className="font-headline text-xl font-bold text-primary">{coachName[0]}</span>
                  </div>
                  <h3 className="font-headline font-bold text-on-surface">Mit AI erstellen</h3>
                  <p className="mt-1.5 text-xs text-on-surface-variant">
                    {coachName} stellt dir Fragen und schlägt einen personalisierten Plan vor.
                  </p>
                </button>

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
          <div className="mx-auto max-w-2xl flex flex-col gap-4 px-4 py-6 pb-10">
            {messages.map((msg) => {
              const parts = msg.parts;
              const textContent = parts.filter(isTextUIPart).map((p) => p.text).join("");
              const proposals = parts
                .map((p, idx) => ({ p, idx }))
                .filter(({ p }) => isProposeTrainingPlanPart(p));

              // Skip messages that have nothing to render.
              if (!textContent && proposals.length === 0) return null;

              return (
                <div key={msg.id} className="flex flex-col gap-3">
                  {/* Text bubble */}
                  {textContent && (
                    <div className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                      {msg.role === "assistant" && (
                        <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-container/20">
                          <span className="font-headline text-xs font-bold text-primary">{coachName[0]}</span>
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
                  )}

                  {/* Tool call proposals */}
                  {proposals.map(({ p, idx }) => {
                    const key = `${msg.id}:${idx}`;
                    const isActive = key === lastProposalKey;

                    if (!isToolUIPart(p)) return null;

                    if (p.state === "input-streaming") {
                      return (
                        <div key={key} className="rounded-2xl bg-surface-container/50 border border-outline-variant/10 p-5">
                          <div className="flex items-center gap-3">
                            <div className="h-5 w-5 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                            <span className="text-sm text-on-surface-variant">Plan wird vorbereitet...</span>
                          </div>
                        </div>
                      );
                    }

                    if (p.state === "output-error") {
                      return (
                        <div key={key} className="rounded-2xl bg-surface-container/50 border border-outline-variant/10 p-4">
                          <p className="text-xs text-on-surface-variant">
                            Der Coach wollte einen Plan vorschlagen, aber die Struktur war noch unvollständig. Frag einfach weiter — er probiert es gleich noch einmal.
                          </p>
                        </div>
                      );
                    }

                    if (p.state !== "input-available" && p.state !== "output-available") {
                      return null;
                    }

                    const proposal = p.input as PlanProposal | undefined;
                    if (!proposal) return null;

                    return (
                      <PlanProposalCard
                        key={key}
                        plan={proposal}
                        active={isActive}
                        saving={isActive && saving}
                        onAccept={() => acceptPlan(proposal)}
                        onRevise={reviseProposal}
                      />
                    );
                  })}
                </div>
              );
            })}
            <div ref={bottomRef} />
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
            <form onSubmit={handleSend} className="flex items-end gap-3">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  lastProposalKey
                    ? "Anpassungswünsche? z.B. 'Mehr Volumen für Rücken'..."
                    : `Antworte ${coachName}...`
                }
                rows={1}
                disabled={saving}
                className="hide-scrollbar flex-1 resize-none rounded-xl bg-surface-container px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none transition-all focus:bg-surface-container-high disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isStreaming || saving}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
                  input.trim() && !isStreaming && !saving
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
    </div>
  );
}

"use client";

import { use, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useWorkoutStore } from "@/stores/workout-store";

type Params = { params: Promise<{ sessionId: string }> };

type PerceivedLoad = "light" | "moderate" | "heavy" | "very_heavy" | "maximal";

const LOAD_OPTIONS: { value: PerceivedLoad; label: string; color: string }[] = [
  { value: "light",      label: "Leicht",      color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { value: "moderate",   label: "Moderat",     color: "bg-secondary-container/30 text-secondary border-secondary/30" },
  { value: "heavy",      label: "Schwer",      color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { value: "very_heavy", label: "Sehr schwer", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { value: "maximal",    label: "Maximal",     color: "bg-error-container/20 text-error border-error/30" },
];

type Analysis = {
  highlights: string[];
  warnings: string[];
  recommendations: string[];
  plateauDetectedExercises: string[];
  overloadDetectedMuscles: string[];
  recoveryEstimates: Record<string, number>;
  nextSessionSuggestions: string[];
};

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Brust", back: "Rücken", shoulders: "Schultern",
  biceps: "Bizeps", triceps: "Trizeps", forearms: "Unterarme",
  quadriceps: "Quadrizeps", hamstrings: "Hamstrings", glutes: "Gesäß",
  calves: "Waden", core: "Core", full_body: "Ganzkörper",
};

export default function WorkoutReviewPage({ params }: Params) {
  const { sessionId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const durationSeconds = parseInt(searchParams.get("duration") ?? "0");

  const { activeWorkout, clearWorkout } = useWorkoutStore();

  const [perceivedLoad, setPerceivedLoad] = useState<PerceivedLoad | null>(null);
  const [satisfaction, setSatisfaction] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    totalVolumeKg: number;
    totalSets: number;
    totalReps: number;
    muscleGroupsTrained: string[];
    aiAnalysis: Analysis | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/workout/${sessionId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationSeconds,
          perceivedLoad: perceivedLoad ?? undefined,
          satisfactionRating: satisfaction ?? undefined,
          feedbackText: feedbackText || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Fehler beim Abschließen des Trainings");
        return;
      }
      setResult(data);
      clearWorkout();
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Result screen ─────────────────────────────────────────────────
  if (result) {
    const analysis = result.aiAnalysis;
    const h = Math.floor(durationSeconds / 3600);
    const m = Math.floor((durationSeconds % 3600) / 60);
    const durationLabel = h > 0 ? `${h}h ${m}min` : `${m} min`;

    return (
      <div className="flex h-full flex-col overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
          {/* Stats */}
          <div>
            <h1 className="font-headline text-2xl font-bold text-on-surface mb-1">
              Training abgeschlossen ✦
            </h1>
            <p className="text-on-surface-variant text-sm">
              {activeWorkout?.title ?? "Workout"}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Dauer", value: durationLabel },
              { label: "Volumen", value: `${result.totalVolumeKg.toFixed(0)} kg` },
              { label: "Sätze", value: String(result.totalSets) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-surface-container-low p-3 text-center">
                <p className="text-xs font-mono uppercase text-on-surface-variant/60 mb-1">{label}</p>
                <p className="font-headline text-xl font-bold text-primary">{value}</p>
              </div>
            ))}
          </div>

          {result.muscleGroupsTrained.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {result.muscleGroupsTrained.map((mg) => (
                <span key={mg} className="rounded-full bg-surface-container px-2.5 py-0.5 text-xs text-on-surface-variant">
                  {MUSCLE_LABELS[mg] ?? mg}
                </span>
              ))}
            </div>
          )}

          {/* AI Analysis */}
          {analysis ? (
            <div className="flex flex-col gap-4">
              <h2 className="font-headline font-bold text-on-surface flex items-center gap-2">
                <span className="text-primary">◈</span> Atlas-Analyse
              </h2>

              {analysis.highlights.length > 0 && (
                <AnalysisSection
                  title="Highlights"
                  items={analysis.highlights}
                  color="text-primary"
                  icon="✦"
                />
              )}

              {analysis.warnings.length > 0 && (
                <AnalysisSection
                  title="Hinweise"
                  items={analysis.warnings}
                  color="text-amber-400"
                  icon="⚠"
                />
              )}

              {analysis.recommendations.length > 0 && (
                <AnalysisSection
                  title="Empfehlungen"
                  items={analysis.recommendations}
                  color="text-secondary"
                  icon="→"
                />
              )}

              {analysis.nextSessionSuggestions.length > 0 && (
                <AnalysisSection
                  title="Nächstes Training"
                  items={analysis.nextSessionSuggestions}
                  color="text-on-surface-variant"
                  icon="◦"
                />
              )}

              {/* Recovery estimates */}
              {Object.keys(analysis.recoveryEstimates).length > 0 && (
                <div className="rounded-xl bg-surface-container-low p-4">
                  <p className="text-xs font-mono uppercase tracking-wider text-on-surface-variant/60 mb-3">
                    Erholung
                  </p>
                  <div className="flex flex-col gap-2">
                    {Object.entries(analysis.recoveryEstimates).map(([muscle, hours]) => (
                      <div key={muscle} className="flex items-center gap-3">
                        <span className="text-sm text-on-surface w-28 shrink-0">
                          {MUSCLE_LABELS[muscle] ?? muscle}
                        </span>
                        <div className="flex-1 h-1.5 bg-surface-container rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/50 rounded-full"
                            style={{ width: `${Math.min(100, (hours / 72) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-on-surface-variant/60 w-12 text-right">
                          {hours}h
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(analysis.plateauDetectedExercises.length > 0 || analysis.overloadDetectedMuscles.length > 0) && (
                <div className="rounded-xl bg-error-container/10 border border-error/20 p-4 flex flex-col gap-3">
                  {analysis.plateauDetectedExercises.length > 0 && (
                    <div>
                      <p className="text-xs font-mono uppercase text-error/70 mb-1">Plateau erkannt</p>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.plateauDetectedExercises.map((ex) => (
                          <span key={ex} className="rounded bg-error/10 px-2 py-0.5 text-xs text-error">{ex}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {analysis.overloadDetectedMuscles.length > 0 && (
                    <div>
                      <p className="text-xs font-mono uppercase text-error/70 mb-1">Überlastung</p>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.overloadDetectedMuscles.map((mg) => (
                          <span key={mg} className="rounded bg-error/10 px-2 py-0.5 text-xs text-error">
                            {MUSCLE_LABELS[mg] ?? mg}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-surface-container-low p-4 text-center text-sm text-on-surface-variant/50">
              Keine AI-Analyse verfügbar (kein AI-Provider konfiguriert)
            </div>
          )}

          <button
            onClick={() => router.push(`/workout/${sessionId}/detail`)}
            className="w-full rounded-xl bg-primary text-on-primary py-3 font-bold hover:opacity-90 transition-all"
          >
            Training Details anzeigen →
          </button>
          <button
            onClick={() => router.push("/workout/history")}
            className="text-sm text-on-surface-variant/50 hover:text-on-surface-variant transition-colors text-center"
          >
            Zur Trainingshistorie
          </button>
        </div>
      </div>
    );
  }

  // ── Survey form ───────────────────────────────────────────────────
  const m = Math.floor(durationSeconds / 60);
  const s = durationSeconds % 60;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="max-w-xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
        <div>
          <h1 className="font-headline text-2xl font-bold text-on-surface mb-1">
            Training beendet
          </h1>
          <p className="text-on-surface-variant text-sm">
            Dauer: {m}:{String(s).padStart(2, "0")} min
          </p>
        </div>

        {/* Perceived load */}
        <div>
          <p className="text-sm font-medium text-on-surface mb-2">Wie war die Belastung?</p>
          <div className="flex flex-wrap gap-2">
            {LOAD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPerceivedLoad(perceivedLoad === opt.value ? null : opt.value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium border transition-all",
                  perceivedLoad === opt.value
                    ? opt.color
                    : "bg-transparent text-on-surface-variant border-outline-variant/20 hover:border-outline-variant"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Satisfaction */}
        <div>
          <p className="text-sm font-medium text-on-surface mb-2">Zufriedenheit</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setSatisfaction(satisfaction === n ? null : n)}
                className={cn(
                  "flex-1 rounded-lg py-2.5 text-lg transition-all",
                  satisfaction === n
                    ? "bg-primary/20 text-primary"
                    : "bg-surface-container text-on-surface-variant/40 hover:bg-surface-container-high"
                )}
              >
                {["😞", "😕", "😐", "😊", "🔥"][n - 1]}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <p className="text-sm font-medium text-on-surface mb-2">Notizen (optional)</p>
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Wie lief das Training? Besonderheiten?"
            rows={3}
            className="w-full rounded-xl bg-surface-container px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-error">{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-xl bg-primary text-on-primary py-3.5 font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50"
        >
          {submitting ? "Analyse läuft…" : "Abschließen & Atlas-Analyse starten"}
        </button>

        <button
          onClick={() => router.push(`/workout/${sessionId}`)}
          className="text-sm text-on-surface-variant/50 hover:text-on-surface-variant transition-colors text-center"
        >
          Zurück zum Training
        </button>
      </div>
    </div>
  );
}

function AnalysisSection({
  title, items, color, icon,
}: {
  title: string; items: string[]; color: string; icon: string;
}) {
  return (
    <div className="rounded-xl bg-surface-container-low p-4">
      <p className="text-xs font-mono uppercase tracking-wider text-on-surface-variant/60 mb-3">{title}</p>
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-on-surface">
            <span className={cn("shrink-0 font-bold", color)}>{icon}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

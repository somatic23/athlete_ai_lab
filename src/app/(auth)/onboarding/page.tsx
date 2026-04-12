"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const schema = z.object({
  birthDate: z.string().optional(),
  gender: z.enum(["male", "female", "diverse"]).optional(),
  weightKg: z.number().min(20).max(500).optional(),
  heightCm: z.number().min(50).max(300).optional(),
  bodyFatPct: z.number().min(1).max(60).optional(),
  goals: z.string().optional(),
  experienceLevel: z
    .enum(["beginner", "intermediate", "advanced", "expert"])
    .optional(),
  injuriesLimitations: z.string().optional(),
  equipmentIds: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof schema>;

type Equipment = { id: string; name: string; description: string | null };

const STEPS = [
  { id: 1, label: "Persoenlich", title: "Persoenliche Daten" },
  { id: 2, label: "Equipment", title: "Dein Equipment" },
  { id: 3, label: "Ziele", title: "Ziele & Einschraenkungen" },
];

const EXPERIENCE_OPTIONS = [
  { value: "beginner", label: "Anfaenger", desc: "< 1 Jahr Erfahrung" },
  { value: "intermediate", label: "Fortgeschritten", desc: "1-3 Jahre" },
  { value: "advanced", label: "Erfahren", desc: "3-5 Jahre" },
  { value: "expert", label: "Experte", desc: "5+ Jahre" },
];

const GENDER_OPTIONS = [
  { value: "male", label: "Maennlich" },
  { value: "female", label: "Weiblich" },
  { value: "diverse", label: "Divers" },
];

export default function OnboardingPage() {
  const { update } = useSession();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, watch, setValue, getValues, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { equipmentIds: [] },
  });

  const selectedGender = watch("gender");
  const selectedExperience = watch("experienceLevel");

  useEffect(() => {
    fetch("/api/equipment")
      .then((r) => r.json())
      .then((data) => setEquipment(data))
      .catch(() => {});
  }, []);

  const toggleEquipment = (id: string) => {
    setSelectedEquipment((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const handleNext = () => {
    if (step < 3) setStep((s) => s + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => s - 1);
  };

  const handleFinish = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    const data = getValues();
    // Strip NaN values produced by empty number inputs (valueAsNumber: true)
    // so Zod treats them as absent optional fields rather than null
    const sanitize = (obj: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(obj).filter(([, v]) => !(typeof v === "number" && isNaN(v as number)))
      );

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sanitize(data as Record<string, unknown>), equipmentIds: selectedEquipment }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSubmitError(body.error ?? `Fehler (${res.status})`);
      } else {
        // Refresh JWT first — middleware must see onboardingCompleted: true
        // before the success screen's "Los geht's" button is clickable.
        await update();
        setDone(true);
      }
    } catch {
      setSubmitError("Verbindungsfehler. Bitte erneut versuchen.");
    }
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* ── Success screen ── */}
        {done && (
          <div className="rounded-xl bg-surface-container p-10 text-center flex flex-col items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary-container/40">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M6 16L13 23L26 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-secondary" />
              </svg>
            </div>
            <div>
              <h2 className="font-headline text-xl font-bold text-on-surface">Profil erstellt</h2>
              <p className="mt-2 text-sm text-on-surface-variant max-w-xs mx-auto">
                Dein Athleten-Profil wurde erfolgreich eingerichtet. Atlas ist bereit, dir zu helfen.
              </p>
            </div>
            {selectedEquipment.length > 0 && (
              <div className="w-full rounded-lg bg-surface-container-high px-4 py-3 text-left">
                <p className="text-xs font-mono uppercase tracking-wider text-on-surface-variant mb-2">
                  Dein Equipment ({selectedEquipment.length})
                </p>
                <p className="text-sm text-on-surface">
                  {equipment
                    .filter((e) => selectedEquipment.includes(e.id))
                    .map((e) => e.name)
                    .join(", ")}
                </p>
              </div>
            )}
            <button
              onClick={() => { window.location.href = "/coach"; }}
              className="mt-2 w-full rounded-md bg-primary-container px-5 py-3 font-headline text-sm font-medium uppercase tracking-wide text-on-primary transition-all hover:opacity-90 active:scale-95"
            >
              Los geht&apos;s →
            </button>
          </div>
        )}

        {/* Header */}
        {!done && <div className="mb-8 text-center">
          <h1 className="font-headline text-2xl font-bold text-primary">
            ATHLETE AI LAB
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Lass uns dein Profil einrichten
          </p>
        </div>}

        {/* Step indicators */}
        {!done && <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md font-headline text-sm font-bold transition-all",
                  step === s.id
                    ? "bg-primary-container text-on-primary"
                    : step > s.id
                    ? "bg-secondary-container text-on-secondary"
                    : "bg-surface-container text-on-surface-variant"
                )}
              >
                {step > s.id ? "✓" : s.id}
              </div>
              <span
                className={cn(
                  "text-xs font-medium uppercase tracking-wider",
                  step === s.id
                    ? "text-primary"
                    : "text-on-surface-variant"
                )}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "ml-2 h-px w-8",
                    step > s.id ? "bg-secondary" : "bg-surface-container-high"
                  )}
                />
              )}
            </div>
          ))}
        </div>}

        {/* Card */}
        {!done && <div className="rounded-xl bg-surface-container p-8">
          <h2 className="mb-6 font-headline text-lg font-semibold text-on-surface">
            {STEPS[step - 1].title}
          </h2>

          {/* Step 1: Personal Info */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  id="birthDate"
                  type="date"
                  label="Geburtsdatum"
                  error={errors.birthDate?.message}
                  {...register("birthDate")}
                />
                <Input
                  id="weightKg"
                  type="number"
                  step="0.1"
                  label="Gewicht (kg)"
                  placeholder="80"
                  error={errors.weightKg?.message}
                  {...register("weightKg", { valueAsNumber: true })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  id="heightCm"
                  type="number"
                  label="Groesse (cm)"
                  placeholder="180"
                  error={errors.heightCm?.message}
                  {...register("heightCm", { valueAsNumber: true })}
                />
                <Input
                  id="bodyFatPct"
                  type="number"
                  step="0.1"
                  label="Koerperfett (%)"
                  placeholder="15"
                  error={errors.bodyFatPct?.message}
                  {...register("bodyFatPct", { valueAsNumber: true })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                  Geschlecht
                </label>
                <div className="flex gap-2">
                  {GENDER_OPTIONS.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => setValue("gender", g.value as FormData["gender"])}
                      className={cn(
                        "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all",
                        selectedGender === g.value
                          ? "bg-primary-container text-on-primary"
                          : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                      )}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                  Erfahrungslevel
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {EXPERIENCE_OPTIONS.map((e) => (
                    <button
                      key={e.value}
                      type="button"
                      onClick={() => setValue("experienceLevel", e.value as FormData["experienceLevel"])}
                      className={cn(
                        "rounded-md px-3 py-2.5 text-left transition-all",
                        selectedExperience === e.value
                          ? "bg-primary-container text-on-primary"
                          : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
                      )}
                    >
                      <p className="text-sm font-medium">{e.label}</p>
                      <p className="text-xs opacity-70">{e.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Equipment */}
          {step === 2 && (
            <div className="flex flex-col gap-3">
              {equipment.length === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  Kein Equipment gefunden. Du kannst dies spaeter in den Einstellungen aendern.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {equipment.map((eq) => (
                    <button
                      key={eq.id}
                      type="button"
                      onClick={() => toggleEquipment(eq.id)}
                      className={cn(
                        "rounded-md px-3 py-2.5 text-left text-sm transition-all",
                        selectedEquipment.includes(eq.id)
                          ? "bg-primary-container text-on-primary"
                          : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
                      )}
                    >
                      {eq.name}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-on-surface-variant">
                {selectedEquipment.length} ausgewaehlt
              </p>
            </div>
          )}

          {/* Step 3: Goals & Injuries */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="goals"
                  className="text-xs font-medium uppercase tracking-widest text-on-surface-variant"
                >
                  Trainingsziele
                </label>
                <textarea
                  id="goals"
                  rows={3}
                  placeholder="z.B. Muskelmasse aufbauen, Maximalkraft steigern, Abnehmen..."
                  className="w-full rounded-md bg-surface-container-highest px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 border-0 outline-none focus:bg-surface-bright focus:border-l-2 focus:border-l-primary-container transition-all resize-none"
                  {...register("goals")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="injuries"
                  className="text-xs font-medium uppercase tracking-widest text-on-surface-variant"
                >
                  Einschraenkungen / Verletzungen
                </label>
                <textarea
                  id="injuries"
                  rows={3}
                  placeholder="z.B. Schulterverletzung links, Bandscheibenvorfall L5/S1..."
                  className="w-full rounded-md bg-surface-container-highest px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 border-0 outline-none focus:bg-surface-bright focus:border-l-2 focus:border-l-primary-container transition-all resize-none"
                  {...register("injuriesLimitations")}
                />
              </div>
              <p className="text-xs text-on-surface-variant">
                Diese Informationen helfen deinem AI Coach, einen sicheren und
                auf dich zugeschnittenen Trainingsplan zu erstellen.
              </p>
            </div>
          )}

          {/* Submit error */}
          {submitError && (
            <p className="mt-4 rounded-md bg-error-container/20 px-3 py-2 text-xs text-error">
              {submitError}
            </p>
          )}

          {/* Navigation */}
          <div className="mt-8 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={handleBack}
              disabled={step === 1}
            >
              Zurueck
            </Button>
            {step < 3 ? (
              <Button type="button" onClick={handleNext}>
                Weiter
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleFinish}
                isLoading={isSubmitting}
              >
                Abschliessen
              </Button>
            )}
          </div>
        </div>}

        {/* Skip link */}
        {!done && <p className="mt-4 text-center text-xs text-on-surface-variant">
          <button
            onClick={handleFinish}
            className="hover:text-primary hover:underline"
          >
            Ueberspringen &rarr;
          </button>
        </p>}
      </div>
    </div>
  );
}

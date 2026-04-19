"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { useLocaleStore } from "@/stores/locale-store";
import { calculateFfmi, FFMI_CATEGORY_LABELS, type FfmiResult } from "@/lib/calculations/ffmi";

// ── Recharts — dynamic to avoid SSR ─────────────────────────────────────
const LineChart           = dynamic(() => import("recharts").then((m) => m.LineChart),           { ssr: false });
const Line                = dynamic(() => import("recharts").then((m) => m.Line),                { ssr: false });
const XAxis               = dynamic(() => import("recharts").then((m) => m.XAxis),               { ssr: false });
const YAxis               = dynamic(() => import("recharts").then((m) => m.YAxis),               { ssr: false });
const Tooltip             = dynamic(() => import("recharts").then((m) => m.Tooltip),             { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });

// ── Types ───────────────────────────────────────────────────────────────

type Measurement = {
  id: string;
  measuredAt: string;
  weightKg: number;
  bodyFatPct: number | null;
  waistCm: number | null;
  chestCm: number | null;
  hipCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  notes: string | null;
  createdAt: string;
};

type Profile = {
  heightCm: number | null;
  weightKg: number | null;
  bodyFatPct: number | null;
};

// ── Helpers ─────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function fmtDateShort(iso: string): string {
  return iso.slice(5);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "2-digit" });
}

const UI = {
  title:                { de: "Körper & FFMI",                    en: "Body & FFMI" },
  subtitle:             { de: "Verlauf deiner Messwerte",         en: "Your measurement history" },
  ffmiCard:             { de: "FFMI",                             en: "FFMI" },
  leanMass:             { de: "Magermasse",                       en: "Lean mass" },
  ffmiRaw:              { de: "FFMI (roh)",                       en: "FFMI (raw)" },
  ffmiMissing:          { de: "Körpergröße und KFA in den Einstellungen hinterlegen, um den FFMI zu berechnen.",
                          en: "Set height and body fat in settings to compute FFMI." },
  goToSettings:         { de: "Zu den Einstellungen",             en: "Go to settings" },
  log:                  { de: "Messung hinzufügen",               en: "Add measurement" },
  date:                 { de: "Datum",                            en: "Date" },
  weight:               { de: "Gewicht (kg)",                     en: "Weight (kg)" },
  bodyFat:              { de: "Körperfett (%)",                   en: "Body fat (%)" },
  more:                 { de: "Weitere Maße",                     en: "More measurements" },
  waist:                { de: "Taille (cm)",                      en: "Waist (cm)" },
  chest:                { de: "Brust (cm)",                       en: "Chest (cm)" },
  hip:                  { de: "Hüfte (cm)",                       en: "Hip (cm)" },
  arm:                  { de: "Arm (cm)",                         en: "Arm (cm)" },
  thigh:                { de: "Oberschenkel (cm)",                en: "Thigh (cm)" },
  notes:                { de: "Notizen",                          en: "Notes" },
  save:                 { de: "Speichern",                        en: "Save" },
  saving:               { de: "Speichere…",                       en: "Saving…" },
  history:              { de: "Verlauf",                          en: "History" },
  trend:                { de: "Trend",                            en: "Trend" },
  emptyHistory:         { de: "Noch keine Messungen erfasst.",    en: "No measurements yet." },
  needTwoPoints:        { de: "Mindestens 2 Messungen für den Chart benötigt.",
                          en: "At least 2 measurements needed for chart." },
  delete:               { de: "Löschen",                          en: "Delete" },
  confirmDelete:        { de: "Messung wirklich löschen?",        en: "Delete this measurement?" },
} as const;

// ── Page ────────────────────────────────────────────────────────────────

export default function BodyPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (k: keyof typeof UI) => UI[k][locale];

  const [profile, setProfile] = useState<Profile | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [form, setForm] = useState({
    measuredAt: todayISO(),
    weightKg: "",
    bodyFatPct: "",
    waistCm: "",
    chestCm: "",
    hipCm: "",
    armCm: "",
    thighCm: "",
    notes: "",
  });
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load data
  useEffect(() => {
    Promise.all([
      fetch("/api/profile").then((r) => r.json()),
      fetch("/api/body-measurements").then((r) => r.json()),
    ])
      .then(([p, m]: [Profile, Measurement[]]) => {
        setProfile({ heightCm: p.heightCm ?? null, weightKg: p.weightKg ?? null, bodyFatPct: p.bodyFatPct ?? null });
        setMeasurements(Array.isArray(m) ? m : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // FFMI for the latest measurement (or user snapshot)
  const latestFfmi: FfmiResult | null = useMemo(() => {
    const latest = measurements[0];
    const weight = latest?.weightKg ?? profile?.weightKg ?? null;
    const bodyFat = latest?.bodyFatPct ?? profile?.bodyFatPct ?? null;
    const height = profile?.heightCm ?? null;
    if (weight == null || bodyFat == null || height == null) return null;
    return calculateFfmi({ weightKg: weight, heightCm: height, bodyFatPct: bodyFat });
  }, [measurements, profile]);

  // Chart data — chronological ascending, with per-row FFMI
  const chartData = useMemo(() => {
    const height = profile?.heightCm ?? null;
    return [...measurements]
      .reverse()
      .map((m) => ({
        date: m.measuredAt,
        weight: m.weightKg,
        ffmi:
          height != null && m.bodyFatPct != null
            ? calculateFfmi({ weightKg: m.weightKg, heightCm: height, bodyFatPct: m.bodyFatPct }).ffmiNormalized
            : null,
      }));
  }, [measurements, profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError(null);

    const weightNum = parseFloat(form.weightKg.replace(",", "."));
    if (!weightNum || Number.isNaN(weightNum)) {
      setError(t("weight"));
      return;
    }

    const payload: Record<string, unknown> = {
      measuredAt: form.measuredAt,
      weightKg: weightNum,
    };
    const optional: Array<[keyof typeof form, string]> = [
      ["bodyFatPct", "bodyFatPct"],
      ["waistCm", "waistCm"],
      ["chestCm", "chestCm"],
      ["hipCm", "hipCm"],
      ["armCm", "armCm"],
      ["thighCm", "thighCm"],
    ];
    for (const [key, apiKey] of optional) {
      const v = form[key];
      if (typeof v === "string" && v.trim() !== "") {
        const n = parseFloat(v.replace(",", "."));
        if (!Number.isNaN(n)) payload[apiKey] = n;
      }
    }
    if (form.notes.trim()) payload.notes = form.notes.trim();

    setSaving(true);
    try {
      const res = await fetch("/api/body-measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Fehler beim Speichern");
        return;
      }
      const created: Measurement = await res.json();
      setMeasurements((prev) => [created, ...prev].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)));
      setProfile((prev) =>
        prev
          ? { ...prev, weightKg: created.weightKg, bodyFatPct: created.bodyFatPct ?? prev.bodyFatPct }
          : prev
      );
      setForm({
        measuredAt: todayISO(),
        weightKg: "",
        bodyFatPct: "",
        waistCm: "",
        chestCm: "",
        hipCm: "",
        armCm: "",
        thighCm: "",
        notes: "",
      });
      setShowMore(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("confirmDelete"))) return;
    const res = await fetch(`/api/body-measurements/${id}`, { method: "DELETE" });
    if (res.ok) {
      setMeasurements((prev) => prev.filter((m) => m.id !== id));
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8">
        <p className="mono-text text-xs text-on-surface-variant/50">Lade…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <header>
        <h1 className="display-text text-xl font-bold text-on-surface">{t("title")}</h1>
        <p className="mt-1 text-sm text-on-surface-variant/70">{t("subtitle")}</p>
      </header>

      {/* FFMI card */}
      <section className="rounded-xl bg-surface-container border border-outline-variant/10 p-5">
        <p className="caption mb-3">{t("ffmiCard")}</p>
        {latestFfmi ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="display-text text-5xl font-bold text-primary-container tabular-nums leading-none">
                {latestFfmi.ffmiNormalized.toFixed(1)}
              </p>
              <p className="mono-text mt-2 text-xs uppercase tracking-widest text-secondary">
                {FFMI_CATEGORY_LABELS[latestFfmi.category][locale]}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Stat label={t("ffmiRaw")} value={latestFfmi.ffmi.toFixed(1)} />
              <Stat label={t("leanMass")} value={`${latestFfmi.leanMassKg.toFixed(1)} kg`} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-on-surface-variant/70">{t("ffmiMissing")}</p>
            <Link
              href="/settings"
              className="mono-text w-fit text-xs uppercase tracking-widest text-primary-container hover:underline"
            >
              {t("goToSettings")} →
            </Link>
          </div>
        )}
      </section>

      {/* Log form */}
      <section className="rounded-xl bg-surface-container border border-outline-variant/10 p-5">
        <p className="caption mb-3">{t("log")}</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={t("date")}>
              <input
                type="date"
                value={form.measuredAt}
                onChange={(e) => setForm((f) => ({ ...f, measuredAt: e.target.value }))}
                required
                max={todayISO()}
                className={inputCls}
              />
            </Field>
            <Field label={t("weight")}>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="80.0"
                value={form.weightKg}
                onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value }))}
                required
                className={inputCls}
              />
            </Field>
            <Field label={t("bodyFat")}>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="15.0"
                value={form.bodyFatPct}
                onChange={(e) => setForm((f) => ({ ...f, bodyFatPct: e.target.value }))}
                className={inputCls}
              />
            </Field>
          </div>

          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="mono-text w-fit text-xs uppercase tracking-widest text-on-surface-variant hover:text-on-surface"
          >
            {showMore ? "−" : "+"} {t("more")}
          </button>

          {showMore && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Field label={t("waist")}>
                <input type="number" inputMode="decimal" step="0.1"
                  value={form.waistCm}
                  onChange={(e) => setForm((f) => ({ ...f, waistCm: e.target.value }))}
                  className={inputCls} />
              </Field>
              <Field label={t("chest")}>
                <input type="number" inputMode="decimal" step="0.1"
                  value={form.chestCm}
                  onChange={(e) => setForm((f) => ({ ...f, chestCm: e.target.value }))}
                  className={inputCls} />
              </Field>
              <Field label={t("hip")}>
                <input type="number" inputMode="decimal" step="0.1"
                  value={form.hipCm}
                  onChange={(e) => setForm((f) => ({ ...f, hipCm: e.target.value }))}
                  className={inputCls} />
              </Field>
              <Field label={t("arm")}>
                <input type="number" inputMode="decimal" step="0.1"
                  value={form.armCm}
                  onChange={(e) => setForm((f) => ({ ...f, armCm: e.target.value }))}
                  className={inputCls} />
              </Field>
              <Field label={t("thigh")}>
                <input type="number" inputMode="decimal" step="0.1"
                  value={form.thighCm}
                  onChange={(e) => setForm((f) => ({ ...f, thighCm: e.target.value }))}
                  className={inputCls} />
              </Field>
            </div>
          )}

          {showMore && (
            <Field label={t("notes")}>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className={cn(inputCls, "resize-none")}
              />
            </Field>
          )}

          {error && (
            <p className="mono-text text-xs text-error">{error}</p>
          )}

          <div>
            <button
              type="submit"
              disabled={saving || !form.weightKg}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                saving || !form.weightKg
                  ? "bg-surface-container-high text-on-surface-variant/40 cursor-not-allowed"
                  : "btn-liquid text-on-primary hover:opacity-90"
              )}
            >
              {saving ? t("saving") : t("save")}
            </button>
          </div>
        </form>
      </section>

      {/* Trend chart */}
      <section className="rounded-xl bg-surface-container border border-outline-variant/10 p-5">
        <p className="caption mb-3">{t("trend")}</p>
        {chartData.length < 2 ? (
          <p className="text-center text-xs text-on-surface-variant/50 py-6">{t("needTwoPoints")}</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDateShort}
                  tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="weight"
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <YAxis
                  yAxisId="ffmi"
                  orientation="right"
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip content={<BodyTooltip />} />
                <Line
                  yAxisId="weight"
                  type="monotone"
                  dataKey="weight"
                  stroke="#CCFF00"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#CCFF00", strokeWidth: 0 }}
                  connectNulls
                />
                <Line
                  yAxisId="ffmi"
                  type="monotone"
                  dataKey="ffmi"
                  stroke="#00E5FF"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#00E5FF", strokeWidth: 0 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* History */}
      <section className="rounded-xl bg-surface-container border border-outline-variant/10 p-5">
        <p className="caption mb-3">{t("history")}</p>
        {measurements.length === 0 ? (
          <p className="text-center text-xs text-on-surface-variant/50 py-6">{t("emptyHistory")}</p>
        ) : (
          <div className="flex flex-col gap-1">
            {measurements.map((m) => {
              const ffmi =
                profile?.heightCm != null && m.bodyFatPct != null
                  ? calculateFfmi({ weightKg: m.weightKg, heightCm: profile.heightCm, bodyFatPct: m.bodyFatPct }).ffmiNormalized
                  : null;
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-4 rounded-lg bg-surface-container-low px-4 py-3"
                >
                  <span className="mono-text text-xs text-on-surface-variant/70 w-20 shrink-0">
                    {fmtDate(m.measuredAt)}
                  </span>
                  <span className="text-sm font-mono font-bold text-on-surface tabular-nums w-20 shrink-0">
                    {m.weightKg.toFixed(1)} kg
                  </span>
                  <span className="text-sm font-mono text-on-surface-variant tabular-nums w-16 shrink-0">
                    {m.bodyFatPct != null ? `${m.bodyFatPct.toFixed(1)}%` : "—"}
                  </span>
                  <span className="text-sm font-mono text-secondary tabular-nums w-16 shrink-0">
                    {ffmi != null ? ffmi.toFixed(1) : "—"}
                  </span>
                  <span className="flex-1 truncate text-xs text-on-surface-variant/60">
                    {m.notes ?? ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(m.id)}
                    className="mono-text shrink-0 text-xs uppercase tracking-widest text-on-surface-variant/40 hover:text-error"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-md bg-surface-container-highest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 border-0 outline-none focus:bg-surface-bright focus:border-l-2 focus:border-l-primary-container transition-all";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="caption">{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mono-text text-[10px] uppercase tracking-widest text-on-surface-variant/50">{label}</p>
      <p className="mt-0.5 font-mono text-base font-semibold text-on-surface tabular-nums">{value}</p>
    </div>
  );
}

function BodyTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; dataKey: string }[];
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-lg bg-surface-container-highest px-3 py-2 text-xs shadow-lg">
      <p className="mono-text text-on-surface-variant mb-1">{label}</p>
      {payload.map((p, i) => (
        <p
          key={i}
          className="font-bold tabular-nums"
          style={{ color: p.dataKey === "weight" ? "#CCFF00" : "#00E5FF" }}
        >
          {p.dataKey === "weight" ? `${p.value?.toFixed(1)} kg` : `FFMI ${p.value?.toFixed(1)}`}
        </p>
      ))}
    </div>
  );
}

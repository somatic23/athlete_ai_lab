"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calculateAge } from "@/lib/utils/age";

// ── Types ──────────────────────────────────────────────────────────────

type Profile = {
  id: string;
  email: string;
  displayName: string;
  birthDate: string | null;
  gender: "male" | "female" | "diverse" | null;
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  experienceLevel: "beginner" | "intermediate" | "advanced" | "expert" | null;
  goals: string | null;
  injuriesLimitations: string | null;
  equipmentIds: string[];
};

type EquipmentItem = {
  id: string;
  name: string;
  description: string | null;
};

// ── Constants ──────────────────────────────────────────────────────────

const GENDER_OPTIONS = [
  { value: "male",    label: "Maennlich" },
  { value: "female",  label: "Weiblich" },
  { value: "diverse", label: "Divers" },
] as const;

const EXPERIENCE_OPTIONS = [
  { value: "beginner",     label: "Anfaenger",      desc: "< 1 Jahr" },
  { value: "intermediate", label: "Fortgeschritten", desc: "1–3 Jahre" },
  { value: "advanced",     label: "Erfahren",        desc: "3–5 Jahre" },
  { value: "expert",       label: "Experte",         desc: "5+ Jahre" },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-on-surface-variant mb-4">
      {children}
    </h2>
  );
}

function SaveBar({
  dirty,
  saving,
  error,
  success,
  onSave,
  onReset,
}: {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  success: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  if (!dirty && !success && !error) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-container px-4 py-3 mt-4">
      {error && <span className="flex-1 text-xs text-error">{error}</span>}
      {success && !error && <span className="flex-1 text-xs text-secondary">Gespeichert</span>}
      {!error && !success && <span className="flex-1 text-xs text-on-surface-variant">Ungespeicherte Aenderungen</span>}
      <Button variant="ghost" size="sm" onClick={onReset} disabled={saving}>Verwerfen</Button>
      <Button size="sm" onClick={onSave} isLoading={saving}>Speichern</Button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [catalog, setCatalog] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Per-section local state
  const [account, setAccount] = useState({ displayName: "", email: "" });
  const [accountDirty, setAccountDirty] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountSuccess, setAccountSuccess] = useState(false);

  const [body, setBody] = useState({
    birthDate: "" as string,
    gender: null as Profile["gender"],
    weightKg: "" as string,
    heightCm: "" as string,
    bodyFatPct: "" as string,
    experienceLevel: null as Profile["experienceLevel"],
    goals: "",
    injuriesLimitations: "",
  });
  const [bodyDirty, setBodyDirty] = useState(false);
  const [bodySaving, setBodySaving] = useState(false);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [bodySuccess, setBodySuccess] = useState(false);

  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [equipmentDirty, setEquipmentDirty] = useState(false);
  const [equipmentSaving, setEquipmentSaving] = useState(false);
  const [equipmentError, setEquipmentError] = useState<string | null>(null);
  const [equipmentSuccess, setEquipmentSuccess] = useState(false);

  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  // Load profile + equipment catalog
  const loadProfile = useCallback(async () => {
    const [profileRes, catalogRes] = await Promise.all([
      fetch("/api/profile"),
      fetch("/api/equipment?locale=de"),
    ]);
    const p: Profile = await profileRes.json();
    const c: EquipmentItem[] = await catalogRes.json();

    setProfile(p);
    setCatalog(c);
    setAccount({ displayName: p.displayName, email: p.email });
    setBody({
      birthDate: p.birthDate ?? "",
      gender: p.gender,
      weightKg: p.weightKg != null ? String(p.weightKg) : "",
      heightCm: p.heightCm != null ? String(p.heightCm) : "",
      bodyFatPct: p.bodyFatPct != null ? String(p.bodyFatPct) : "",
      experienceLevel: p.experienceLevel,
      goals: p.goals ?? "",
      injuriesLimitations: p.injuriesLimitations ?? "",
    });
    setSelectedEquipment(p.equipmentIds);
    setLoading(false);
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // ── Account section ──────────────────────────────────────────────────

  function handleAccountChange(field: keyof typeof account, value: string) {
    setAccount((prev) => ({ ...prev, [field]: value }));
    setAccountDirty(true);
    setAccountSuccess(false);
    setAccountError(null);
  }

  function resetAccount() {
    if (!profile) return;
    setAccount({ displayName: profile.displayName, email: profile.email });
    setAccountDirty(false);
    setAccountError(null);
    setAccountSuccess(false);
  }

  async function saveAccount() {
    setAccountSaving(true);
    setAccountError(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: account.displayName, email: account.email }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAccountError(data.error ?? "Fehler beim Speichern");
    } else {
      setAccountDirty(false);
      setAccountSuccess(true);
      setProfile((p) => p ? { ...p, ...account } : p);
    }
    setAccountSaving(false);
  }

  // ── Body section ─────────────────────────────────────────────────────

  function handleBodyChange(field: keyof typeof body, value: unknown) {
    setBody((prev) => ({ ...prev, [field]: value }));
    setBodyDirty(true);
    setBodySuccess(false);
    setBodyError(null);
  }

  function resetBody() {
    if (!profile) return;
    setBody({
      birthDate: profile.birthDate ?? "",
      gender: profile.gender,
      weightKg: profile.weightKg != null ? String(profile.weightKg) : "",
      heightCm: profile.heightCm != null ? String(profile.heightCm) : "",
      bodyFatPct: profile.bodyFatPct != null ? String(profile.bodyFatPct) : "",
      experienceLevel: profile.experienceLevel,
      goals: profile.goals ?? "",
      injuriesLimitations: profile.injuriesLimitations ?? "",
    });
    setBodyDirty(false);
    setBodyError(null);
    setBodySuccess(false);
  }

  async function saveBody() {
    setBodySaving(true);
    setBodyError(null);
    const payload = {
      birthDate:         body.birthDate || null,
      gender:            body.gender,
      weightKg:          body.weightKg  ? parseFloat(body.weightKg)    : null,
      heightCm:          body.heightCm  ? parseInt(body.heightCm, 10)  : null,
      bodyFatPct:        body.bodyFatPct ? parseFloat(body.bodyFatPct) : null,
      experienceLevel:   body.experienceLevel,
      goals:             body.goals             || null,
      injuriesLimitations: body.injuriesLimitations || null,
    };
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setBodyError(data.error ?? "Fehler beim Speichern");
    } else {
      setBodyDirty(false);
      setBodySuccess(true);
      setProfile((p) => p ? { ...p, ...payload, birthDate: payload.birthDate } : p);
    }
    setBodySaving(false);
  }

  // ── Equipment section ────────────────────────────────────────────────

  function toggleEquipment(id: string) {
    setSelectedEquipment((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
    setEquipmentDirty(true);
    setEquipmentSuccess(false);
    setEquipmentError(null);
  }

  function resetEquipment() {
    setSelectedEquipment(profile?.equipmentIds ?? []);
    setEquipmentDirty(false);
    setEquipmentError(null);
    setEquipmentSuccess(false);
  }

  async function saveEquipment() {
    setEquipmentSaving(true);
    setEquipmentError(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equipmentIds: selectedEquipment }),
    });
    const data = await res.json();
    if (!res.ok) {
      setEquipmentError(data.error ?? "Fehler beim Speichern");
    } else {
      setEquipmentDirty(false);
      setEquipmentSuccess(true);
      setProfile((p) => p ? { ...p, equipmentIds: selectedEquipment } : p);
    }
    setEquipmentSaving(false);
  }

  // ── Password section ─────────────────────────────────────────────────

  async function savePassword() {
    setPwError(null);
    if (pw.newPassword !== pw.confirmPassword) {
      setPwError("Passwörter stimmen nicht überein");
      return;
    }
    if (pw.newPassword.length < 8) {
      setPwError("Mindestens 8 Zeichen");
      return;
    }
    setPwSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setPwError(data.error ?? "Fehler beim Speichern");
    } else {
      setPwSuccess(true);
      setPw({ currentPassword: "", newPassword: "", confirmPassword: "" });
    }
    setPwSaving(false);
  }

  // ── Render ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-on-surface-variant">
        Laden...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-10">

        <div>
          <h1 className="font-headline text-2xl font-bold text-on-surface">Einstellungen</h1>
          <p className="text-sm text-on-surface-variant mt-1">Athleten-Profil und Konto verwalten</p>
        </div>

        {/* ── Anmeldedaten ── */}
        <section>
          <SectionTitle>Anmeldedaten</SectionTitle>
          <div className="rounded-xl bg-surface-container p-5 flex flex-col gap-4">
            <Input
              id="displayName"
              label="Name"
              value={account.displayName}
              onChange={(e) => handleAccountChange("displayName", e.target.value)}
            />
            <Input
              id="email"
              label="E-Mail"
              type="email"
              value={account.email}
              onChange={(e) => handleAccountChange("email", e.target.value)}
            />
          </div>
          <SaveBar
            dirty={accountDirty}
            saving={accountSaving}
            error={accountError}
            success={accountSuccess}
            onSave={saveAccount}
            onReset={resetAccount}
          />
        </section>

        {/* ── Passwort ── */}
        <section>
          <SectionTitle>Passwort aendern</SectionTitle>
          <div className="rounded-xl bg-surface-container p-5 flex flex-col gap-4">
            <Input
              id="currentPassword"
              label="Aktuelles Passwort"
              type="password"
              value={pw.currentPassword}
              onChange={(e) => { setPw((p) => ({ ...p, currentPassword: e.target.value })); setPwSuccess(false); setPwError(null); }}
              autoComplete="current-password"
            />
            <Input
              id="newPassword"
              label="Neues Passwort"
              type="password"
              value={pw.newPassword}
              onChange={(e) => { setPw((p) => ({ ...p, newPassword: e.target.value })); setPwSuccess(false); setPwError(null); }}
              autoComplete="new-password"
            />
            <Input
              id="confirmPassword"
              label="Passwort bestaetigen"
              type="password"
              value={pw.confirmPassword}
              onChange={(e) => { setPw((p) => ({ ...p, confirmPassword: e.target.value })); setPwSuccess(false); setPwError(null); }}
              autoComplete="new-password"
            />
            {pwError && <p className="text-xs text-error">{pwError}</p>}
            {pwSuccess && <p className="text-xs text-secondary">Passwort erfolgreich geaendert</p>}
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={savePassword}
                isLoading={pwSaving}
                disabled={!pw.currentPassword || !pw.newPassword || !pw.confirmPassword}
              >
                Passwort aendern
              </Button>
            </div>
          </div>
        </section>

        {/* ── Koerperdaten ── */}
        <section>
          <SectionTitle>Koerperdaten</SectionTitle>
          <div className="rounded-xl bg-surface-container p-5 flex flex-col gap-5">
            {/* Birth date + computed age */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="birthDate" className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                Geburtsdatum
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="birthDate"
                  type="date"
                  value={body.birthDate}
                  onChange={(e) => handleBodyChange("birthDate", e.target.value)}
                  className="flex-1 rounded-md bg-surface-container-highest px-4 py-3 text-sm text-on-surface border-0 outline-none focus:bg-surface-bright focus:border-l-2 focus:border-l-primary-container transition-all"
                />
                {body.birthDate && (
                  <span className="shrink-0 text-sm font-mono text-secondary">
                    {calculateAge(body.birthDate)} Jahre
                  </span>
                )}
              </div>
            </div>

            {/* Numeric grid */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                id="weightKg"
                label="Gewicht (kg)"
                type="number"
                step="0.1"
                placeholder="80"
                value={body.weightKg}
                onChange={(e) => handleBodyChange("weightKg", e.target.value)}
              />
              <Input
                id="heightCm"
                label="Groesse (cm)"
                type="number"
                placeholder="180"
                value={body.heightCm}
                onChange={(e) => handleBodyChange("heightCm", e.target.value)}
              />
              <Input
                id="bodyFatPct"
                label="Koerperfett (%)"
                type="number"
                step="0.1"
                placeholder="15"
                value={body.bodyFatPct}
                onChange={(e) => handleBodyChange("bodyFatPct", e.target.value)}
              />
            </div>

            {/* Gender */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                Geschlecht
              </span>
              <div className="flex gap-2">
                {GENDER_OPTIONS.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => handleBodyChange("gender", body.gender === g.value ? null : g.value)}
                    className={cn(
                      "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all",
                      body.gender === g.value
                        ? "bg-primary-container text-on-primary"
                        : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                    )}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Experience */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                Trainingserfahrung
              </span>
              <div className="grid grid-cols-2 gap-2">
                {EXPERIENCE_OPTIONS.map((e) => (
                  <button
                    key={e.value}
                    type="button"
                    onClick={() => handleBodyChange("experienceLevel", body.experienceLevel === e.value ? null : e.value)}
                    className={cn(
                      "rounded-md px-3 py-2.5 text-left transition-all",
                      body.experienceLevel === e.value
                        ? "bg-primary-container text-on-primary"
                        : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
                    )}
                  >
                    <p className="text-sm font-medium">{e.label}</p>
                    <p className="text-xs opacity-60">{e.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Goals */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="goals" className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                Trainingsziele
              </label>
              <textarea
                id="goals"
                rows={3}
                placeholder="z.B. Muskelmasse aufbauen, Maximalkraft steigern..."
                value={body.goals}
                onChange={(e) => handleBodyChange("goals", e.target.value)}
                className="w-full rounded-md bg-surface-container-highest px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 border-0 outline-none focus:bg-surface-bright focus:border-l-2 focus:border-l-primary-container transition-all resize-none"
              />
            </div>

            {/* Injuries */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="injuries" className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                Verletzungen / Einschraenkungen
              </label>
              <textarea
                id="injuries"
                rows={3}
                placeholder="z.B. Schulterverletzung links, Bandscheibenvorfall L5/S1..."
                value={body.injuriesLimitations}
                onChange={(e) => handleBodyChange("injuriesLimitations", e.target.value)}
                className="w-full rounded-md bg-surface-container-highest px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 border-0 outline-none focus:bg-surface-bright focus:border-l-2 focus:border-l-primary-container transition-all resize-none"
              />
            </div>
          </div>
          <SaveBar
            dirty={bodyDirty}
            saving={bodySaving}
            error={bodyError}
            success={bodySuccess}
            onSave={saveBody}
            onReset={resetBody}
          />
        </section>

        {/* ── Equipment ── */}
        <section>
          <SectionTitle>Verfuegbares Equipment</SectionTitle>
          <div className="rounded-xl bg-surface-container p-5">
            {catalog.length === 0 ? (
              <p className="text-sm text-on-surface-variant">Kein Equipment im Katalog vorhanden.</p>
            ) : (
              <>
                <p className="text-xs text-on-surface-variant mb-4">
                  {selectedEquipment.length} von {catalog.length} ausgewaehlt
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {catalog.map((item) => {
                    const selected = selectedEquipment.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleEquipment(item.id)}
                        className={cn(
                          "rounded-md px-3 py-2.5 text-left text-sm transition-all",
                          selected
                            ? "bg-primary-container text-on-primary"
                            : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-xs font-bold transition-colors",
                            selected
                              ? "border-on-primary bg-transparent text-on-primary"
                              : "border-outline-variant text-transparent"
                          )}>
                            ✓
                          </span>
                          {item.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <SaveBar
            dirty={equipmentDirty}
            saving={equipmentSaving}
            error={equipmentError}
            success={equipmentSuccess}
            onSave={saveEquipment}
            onReset={resetEquipment}
          />
        </section>

        <div className="h-6" />
      </div>
    </div>
  );
}

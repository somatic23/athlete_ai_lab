"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Input } from "@/components/ui/input";
import { calculateAge } from "@/lib/utils/age";
import Image from "next/image";
import { useLocaleStore, type AppLocale } from "@/stores/locale-store";
import { useToast } from "@/stores/toast-store";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CATEGORY_LABELS,
  type EquipmentCategory,
} from "@/lib/equipment-categories";
import { PERSONALITY_DEFS, type CoachPersonality } from "@/lib/coach-personalities";

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
  preferredLocale: AppLocale;
  coachPersonality: CoachPersonality;
  avatarUrl: string | null;
  equipmentIds: string[];
};

type EquipmentItem = {
  id: string;
  name: string;
  description: string | null;
  category: EquipmentCategory | null;
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
    <h2 className="caption mb-4">
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
    <div className="flex items-center gap-3 rounded-xl bg-surface-container border border-outline-variant/10 px-4 py-3 mt-3">
      {error && <span className="flex-1 mono-text text-[11px] text-error">{error}</span>}
      {success && !error && <span className="flex-1 mono-text text-[11px] text-secondary">● Gespeichert</span>}
      {!error && !success && <span className="flex-1 mono-text text-[11px] text-on-surface-variant/60">○ Ungespeicherte Änderungen</span>}
      <button onClick={onReset} disabled={saving} className="rounded-lg px-3 py-1.5 text-xs text-on-surface-variant hover:bg-surface-container-high transition-all disabled:opacity-40">
        Verwerfen
      </button>
      <button onClick={onSave} disabled={saving} className="btn-liquid rounded-lg px-4 py-1.5 text-xs font-bold text-on-primary disabled:opacity-40">
        {saving ? "…" : "Speichern"}
      </button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────

const LANGUAGE_OPTIONS: { value: AppLocale; labelDe: string; labelNative: string; flag: string }[] = [
  { value: "de", labelDe: "Deutsch", labelNative: "Deutsch", flag: "🇩🇪" },
  { value: "en", labelDe: "Englisch", labelNative: "English", flag: "🇬🇧" },
];

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [catalog, setCatalog] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const { locale: storeLocale, setLocale: setStoreLocale } = useLocaleStore();
  const toast = useToast();

  // Language section state
  const [selectedLocale, setSelectedLocale] = useState<AppLocale>("de");
  const [localeDirty, setLocaleDirty] = useState(false);
  const [localeSaving, setLocaleSaving] = useState(false);
  const [localeError, setLocaleError] = useState<string | null>(null);
  const [localeSuccess, setLocaleSuccess] = useState(false);

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
  const [eqSearch, setEqSearch] = useState("");
  const [eqCategoryFilter, setEqCategoryFilter] = useState<EquipmentCategory | null>(null);

  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [selectedPersonality, setSelectedPersonality] = useState<CoachPersonality>("atlas");
  const [personalityDirty, setPersonalityDirty] = useState(false);
  const [personalitySaving, setPersonalitySaving] = useState(false);
  const [personalityError, setPersonalityError] = useState<string | null>(null);
  const [personalitySuccess, setPersonalitySuccess] = useState(false);

  // Load profile + equipment catalog
  const loadProfile = useCallback(async () => {
    const [profileRes, catalogRes] = await Promise.all([
      fetch("/api/profile"),
      fetch(`/api/equipment?locale=${storeLocale}`),
    ]);
    const p: Profile = await profileRes.json();
    const c: EquipmentItem[] = await catalogRes.json();

    setProfile(p);
    setCatalog(c);
    setSelectedLocale(p.preferredLocale ?? "de");
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
    setSelectedPersonality(p.coachPersonality ?? "atlas");
    setAvatarUrl(p.avatarUrl ?? null);
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
      toast.success("Konto gespeichert");
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
      toast.success("Profil gespeichert");
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
      toast.success("Equipment gespeichert");
      setProfile((p) => p ? { ...p, equipmentIds: selectedEquipment } : p);
    }
    setEquipmentSaving(false);
  }

  // ── Language section ─────────────────────────────────────────────────

  function handleLocaleChange(l: AppLocale) {
    setSelectedLocale(l);
    setLocaleDirty(l !== (profile?.preferredLocale ?? "de"));
    setLocaleSuccess(false);
    setLocaleError(null);
  }

  function resetLocale() {
    setSelectedLocale(profile?.preferredLocale ?? "de");
    setLocaleDirty(false);
    setLocaleError(null);
    setLocaleSuccess(false);
  }

  async function saveLocale() {
    setLocaleSaving(true);
    setLocaleError(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredLocale: selectedLocale }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLocaleError(data.error ?? "Fehler beim Speichern");
    } else {
      setLocaleDirty(false);
      setLocaleSuccess(true);
      setStoreLocale(selectedLocale);
      toast.success(selectedLocale === "en" ? "Language saved" : "Sprache gespeichert");
      setProfile((p) => p ? { ...p, preferredLocale: selectedLocale } : p);
    }
    setLocaleSaving(false);
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

  // ── Avatar section ────────────────────────────────────────────────────

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setAvatarError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/profile/avatar", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      setAvatarError(data.error ?? "Upload fehlgeschlagen");
    } else {
      setAvatarUrl(data.avatarUrl);
      toast.success("Profilbild gespeichert");
    }
    setAvatarUploading(false);
    e.target.value = "";
  }

  async function handleAvatarDelete() {
    setAvatarUploading(true);
    setAvatarError(null);
    const res = await fetch("/api/profile/avatar", { method: "DELETE" });
    if (res.ok) {
      setAvatarUrl(null);
      toast.success("Profilbild entfernt");
    } else {
      setAvatarError("Löschen fehlgeschlagen");
    }
    setAvatarUploading(false);
  }

  // ── Coach personality section ─────────────────────────────────────────

  function handlePersonalityChange(p: CoachPersonality) {
    setSelectedPersonality(p);
    setPersonalityDirty(p !== (profile?.coachPersonality ?? "atlas"));
    setPersonalitySuccess(false);
    setPersonalityError(null);
  }

  function resetPersonality() {
    setSelectedPersonality(profile?.coachPersonality ?? "atlas");
    setPersonalityDirty(false);
    setPersonalityError(null);
    setPersonalitySuccess(false);
  }

  async function savePersonality() {
    setPersonalitySaving(true);
    setPersonalityError(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachPersonality: selectedPersonality }),
    });
    const data = await res.json();
    if (!res.ok) {
      setPersonalityError(data.error ?? "Fehler beim Speichern");
    } else {
      setPersonalityDirty(false);
      setPersonalitySuccess(true);
      toast.success("Coach-Stil gespeichert");
      setProfile((p) => p ? { ...p, coachPersonality: selectedPersonality } : p);
    }
    setPersonalitySaving(false);
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
      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-10">

        <div>
          <h1 className="display-text text-2xl font-bold text-on-surface">Einstellungen</h1>
          <p className="text-sm text-on-surface-variant mt-1">Athleten-Profil und Konto verwalten</p>
        </div>

        {/* ── Profilbild ── */}
        <section>
          <SectionTitle>Profilbild</SectionTitle>
          <div className="rounded-xl bg-surface-container border border-outline-variant/10 p-5">
            <div className="flex items-center gap-5">
              <div className="relative shrink-0">
                <div className="h-20 w-20 rounded-full overflow-hidden bg-surface-container-high flex items-center justify-center ring-2 ring-outline-variant/15">
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt="Profilbild"
                      width={80}
                      height={80}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="text-2xl font-bold text-on-surface-variant select-none">
                      {profile?.displayName?.[0]?.toUpperCase() ?? "?"}
                    </span>
                  )}
                </div>
                {avatarUploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-surface/60">
                    <span className="text-xs text-on-surface-variant animate-pulse">…</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className={cn(
                  "cursor-pointer rounded-lg px-4 py-2 text-sm font-bold text-center transition-all",
                  avatarUploading
                    ? "opacity-40 pointer-events-none bg-surface-container-high text-on-surface-variant"
                    : "btn-liquid text-on-primary"
                )}>
                  {avatarUrl ? "Bild ändern" : "↑ Bild hochladen"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={handleAvatarChange}
                    disabled={avatarUploading}
                  />
                </label>
                {avatarUrl && (
                  <button
                    onClick={handleAvatarDelete}
                    disabled={avatarUploading}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-error hover:bg-error/10 transition-all disabled:opacity-50"
                  >
                    Entfernen
                  </button>
                )}
                <p className="caption">JPEG · PNG · WebP · max. 3 MB</p>
              </div>
            </div>
            {avatarError && <p className="mt-3 text-xs text-error">{avatarError}</p>}
          </div>
        </section>

        {/* ── Sprache ── */}
        <section>
          <SectionTitle>Sprache / Language</SectionTitle>
          <div className="rounded-xl bg-surface-container border border-outline-variant/10 p-5">
            <p className="mono-text text-[11px] text-on-surface-variant/60 mb-4">
              Steuert die Anzeigesprache und die Antwortsprache des AI Coaches.
              <br />Controls the display language and the AI coach response language.
            </p>
            <div className="flex gap-3">
              {LANGUAGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleLocaleChange(opt.value)}
                  className={cn(
                    "flex flex-1 items-center gap-3 rounded-xl px-4 py-3 text-left transition-all border",
                    selectedLocale === opt.value
                      ? "border-primary/30 bg-primary-container/10 text-on-surface"
                      : "border-outline-variant/10 bg-surface-container-high text-on-surface-variant hover:border-outline-variant/25"
                  )}
                >
                  <span className="text-2xl">{opt.flag}</span>
                  <div>
                    <p className="text-sm font-semibold">{opt.labelNative}</p>
                    <p className="caption">{opt.labelDe}</p>
                  </div>
                  {selectedLocale === opt.value && (
                    <span className="ml-auto mono-text text-[11px] font-bold" style={{ color: "var(--color-primary-container)" }}>◉</span>
                  )}
                </button>
              ))}
            </div>
            {storeLocale !== selectedLocale && !localeDirty && (
              <p className="caption mt-3">
                Aktiv: {storeLocale.toUpperCase()} · Ausstehend: {selectedLocale.toUpperCase()}
              </p>
            )}
          </div>
          <SaveBar
            dirty={localeDirty}
            saving={localeSaving}
            error={localeError}
            success={localeSuccess}
            onSave={saveLocale}
            onReset={resetLocale}
          />
        </section>

        {/* ── Coach-Stil ── */}
        <section>
          <SectionTitle>Coach-Persönlichkeit</SectionTitle>
          <div className="flex flex-col gap-2">
            {PERSONALITY_DEFS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePersonalityChange(p.id)}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left transition-all",
                  selectedPersonality === p.id
                    ? "border-primary/30 bg-primary-container/10 text-on-surface"
                    : "border-outline-variant/10 bg-surface-container text-on-surface hover:border-outline-variant/25"
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{p.label}</p>
                  {selectedPersonality === p.id && (
                    <span className="mono-text text-[11px] font-bold" style={{ color: "var(--color-primary-container)" }}>◉ AKTIV</span>
                  )}
                </div>
                <p className="caption mt-0.5">{p.tagline}</p>
              </button>
            ))}
          </div>
          <SaveBar
            dirty={personalityDirty}
            saving={personalitySaving}
            error={personalityError}
            success={personalitySuccess}
            onSave={savePersonality}
            onReset={resetPersonality}
          />
        </section>

        {/* ── Anmeldedaten ── */}
        <section>
          <SectionTitle>Anmeldedaten</SectionTitle>
          <div className="rounded-xl bg-surface-container border border-outline-variant/10 p-5 flex flex-col gap-4">
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
          <SectionTitle>Passwort ändern</SectionTitle>
          <div className="rounded-xl bg-surface-container border border-outline-variant/10 p-5 flex flex-col gap-4">
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
            {pwError && <p className="mono-text text-[11px] text-error">{pwError}</p>}
            {pwSuccess && <p className="mono-text text-[11px] text-secondary">● Passwort erfolgreich geändert</p>}
            <div className="flex justify-end">
              <button
                onClick={savePassword}
                disabled={pwSaving || !pw.currentPassword || !pw.newPassword || !pw.confirmPassword}
                className="btn-liquid rounded-lg px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-40"
              >
                {pwSaving ? "…" : "Passwort ändern"}
              </button>
            </div>
          </div>
        </section>

        {/* ── Körperdaten ── */}
        <section>
          <SectionTitle>Körperdaten</SectionTitle>
          <div className="rounded-xl bg-surface-container border border-outline-variant/10 p-5 flex flex-col gap-5">
            {/* Birth date + computed age */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="birthDate" className="caption">
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

            <Link
              href="/body"
              className="mono-text w-fit text-xs uppercase tracking-widest text-primary-container hover:underline"
            >
              Verlauf & FFMI ansehen →
            </Link>

            {/* Gender */}
            <div className="flex flex-col gap-1.5">
              <span className="caption">
                Geschlecht
              </span>
              <div className="flex gap-2">
                {GENDER_OPTIONS.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => handleBodyChange("gender", body.gender === g.value ? null : g.value)}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all",
                      body.gender === g.value
                        ? "border-primary/30 bg-primary-container/10 text-on-surface"
                        : "border-outline-variant/10 bg-surface-container-high text-on-surface-variant hover:border-outline-variant/25"
                    )}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Experience */}
            <div className="flex flex-col gap-1.5">
              <span className="caption">
                Trainingserfahrung
              </span>
              <div className="grid grid-cols-2 gap-2">
                {EXPERIENCE_OPTIONS.map((e) => (
                  <button
                    key={e.value}
                    type="button"
                    onClick={() => handleBodyChange("experienceLevel", body.experienceLevel === e.value ? null : e.value)}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-left transition-all",
                      body.experienceLevel === e.value
                        ? "border-primary/30 bg-primary-container/10 text-on-surface"
                        : "border-outline-variant/10 bg-surface-container-high text-on-surface hover:border-outline-variant/25"
                    )}
                  >
                    <p className="text-sm font-medium">{e.label}</p>
                    <p className="caption mt-0.5">{e.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Goals */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="goals" className="caption">
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
              <label htmlFor="injuries" className="caption">
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
          <SectionTitle>Verfügbares Equipment</SectionTitle>
          <div className="rounded-xl bg-surface-container border border-outline-variant/10 overflow-hidden">
            {catalog.length === 0 ? (
              <p className="p-5 text-sm text-on-surface-variant">Kein Equipment im Katalog vorhanden.</p>
            ) : (() => {
              // Derived filtered list
              const searchLow = eqSearch.toLowerCase();
              const filtered = catalog.filter((item) => {
                const matchesSearch = !searchLow || item.name.toLowerCase().includes(searchLow);
                const matchesCategory = !eqCategoryFilter || item.category === eqCategoryFilter;
                return matchesSearch && matchesCategory;
              });

              // Categories present in catalog (for chips)
              const presentCategories = EQUIPMENT_CATEGORIES.filter((cat) =>
                catalog.some((item) => item.category === cat)
              );

              // Group by category (only when no search active)
              const showGrouped = !searchLow && !eqCategoryFilter;
              const groups: { catKey: EquipmentCategory | null; label: string; items: typeof catalog }[] = [];
              if (showGrouped) {
                for (const cat of EQUIPMENT_CATEGORIES) {
                  const items = catalog.filter((i) => i.category === cat);
                  if (items.length) groups.push({
                    catKey: cat,
                    label: storeLocale === "en"
                      ? EQUIPMENT_CATEGORY_LABELS[cat].en
                      : EQUIPMENT_CATEGORY_LABELS[cat].de,
                    items,
                  });
                }
                const uncategorized = catalog.filter((i) => !i.category);
                if (uncategorized.length) groups.push({ catKey: null, label: "Sonstiges", items: uncategorized });
              }

              return (
                <>
                  {/* Search + count row */}
                  <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40 text-xs pointer-events-none">
                        ⌕
                      </span>
                      <input
                        type="search"
                        placeholder="Suchen…"
                        value={eqSearch}
                        onChange={(e) => setEqSearch(e.target.value)}
                        className="w-full rounded-lg bg-surface-container-high pl-7 pr-3 py-1.5 text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none focus:ring-1 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <span className="shrink-0 text-xs font-mono text-on-surface-variant/50">
                      {selectedEquipment.length}/{catalog.length}
                    </span>
                  </div>

                  {/* Category filter chips */}
                  {presentCategories.length > 1 && (
                    <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto no-scrollbar">
                      <button
                        onClick={() => setEqCategoryFilter(null)}
                        className={cn(
                          "shrink-0 rounded-full border px-2.5 py-0.5 mono-text text-[10px] transition-all",
                          !eqCategoryFilter
                            ? "border-primary/30 bg-primary-container/15 text-on-surface"
                            : "border-outline-variant/10 bg-surface-container-high text-on-surface-variant hover:border-outline-variant/25"
                        )}
                      >
                        Alle
                      </button>
                      {presentCategories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setEqCategoryFilter(eqCategoryFilter === cat ? null : cat)}
                          className={cn(
                            "shrink-0 rounded-full border px-2.5 py-0.5 mono-text text-[10px] transition-all",
                            eqCategoryFilter === cat
                              ? "border-primary/30 bg-primary-container/15 text-on-surface"
                              : "border-outline-variant/10 bg-surface-container-high text-on-surface-variant hover:border-outline-variant/25"
                          )}
                        >
                          {storeLocale === "en"
                            ? EQUIPMENT_CATEGORY_LABELS[cat].en
                            : EQUIPMENT_CATEGORY_LABELS[cat].de}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Items */}
                  <div className="px-4 pb-4 max-h-150 overflow-y-auto no-scrollbar">
                    {filtered.length === 0 ? (
                      <p className="text-xs text-on-surface-variant/50 py-4 text-center">Keine Treffer</p>
                    ) : showGrouped ? (
                      <div className="flex flex-col gap-4">
                        {groups.map(({ catKey, label, items }) => (
                          <div key={catKey ?? "__none"}>
                            <p className="caption mb-1.5">{label}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {items.map((item) => {
                                const selected = selectedEquipment.includes(item.id);
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => toggleEquipment(item.id)}
                                    className={cn(
                                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                                      selected
                                        ? "border-primary/30 bg-primary-container/15 text-on-surface"
                                        : "border-outline-variant/10 bg-surface-container-high text-on-surface-variant hover:border-outline-variant/25"
                                    )}
                                  >
                                    {selected && <span className="mr-1 text-[10px]">✓</span>}
                                    {item.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {filtered.map((item) => {
                          const selected = selectedEquipment.includes(item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => toggleEquipment(item.id)}
                              className={cn(
                                "rounded-full px-2.5 py-1 text-xs font-medium transition-all",
                                selected
                                  ? "bg-primary text-on-primary"
                                  : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                              )}
                            >
                              {selected && <span className="mr-1 text-[10px]">✓</span>}
                              {item.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
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

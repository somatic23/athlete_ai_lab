import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppLocale = "de" | "en";

type LocaleStore = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
};

export const useLocaleStore = create<LocaleStore>()(
  persist(
    (set) => ({
      locale: "de",
      setLocale: (locale) => set({ locale }),
    }),
    { name: "locale" }
  )
);

// ── Translation tables ────────────────────────────────────────────────────

const translations = {
  de: {
    settings: {
      title: "Einstellungen",
      subtitle: "Athleten-Profil und Konto verwalten",
      language: "Sprache",
      languageSubtitle: "Anzeigesprache und KI-Antwortsprache",
      de: "Deutsch",
      en: "English",
    },
  },
  en: {
    settings: {
      title: "Settings",
      subtitle: "Manage athlete profile and account",
      language: "Language",
      languageSubtitle: "Display language and AI response language",
      de: "Deutsch",
      en: "English",
    },
  },
} as const;

export type TranslationKey = keyof (typeof translations)["de"]["settings"];

export function useTranslations() {
  const locale = useLocaleStore((s) => s.locale);
  return {
    locale,
    t: (section: keyof typeof translations["de"], key: string): string => {
      const sec = translations[locale]?.[section] as Record<string, string> | undefined;
      return sec?.[key] ?? (translations["de"][section] as Record<string, string>)[key] ?? key;
    },
  };
}

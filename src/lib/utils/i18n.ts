export type I18nText = { de: string; en: string };

/** Parse a JSON i18n column value into a typed object. */
export function parseI18n(raw: string | null | undefined): I18nText {
  if (!raw) return { de: "", en: "" };
  try {
    const parsed = JSON.parse(raw);
    return { de: parsed.de ?? "", en: parsed.en ?? "" };
  } catch {
    return { de: raw, en: raw }; // legacy plain string — treat as German
  }
}

/** Serialize an I18nText object to a JSON string for DB storage. */
export function stringifyI18n(value: I18nText): string {
  return JSON.stringify(value);
}

/** Extract a single locale string from a raw JSON column value. */
export function getLocalized(
  raw: string | null | undefined,
  locale: string,
  fallback = "de"
): string {
  const parsed = parseI18n(raw);
  return (parsed as Record<string, string>)[locale] ?? parsed[fallback as keyof I18nText] ?? "";
}

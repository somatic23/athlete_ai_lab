/**
 * Extracts the first valid top-level JSON object from a string.
 * Strips markdown code fences before searching.
 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  // Strip markdown fences
  const stripped = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  let depth = 0;
  let start = -1;
  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (stripped[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          return JSON.parse(stripped.slice(start, i + 1));
        } catch {
          // This brace pair wasn't valid JSON — reset and keep looking
          start = -1;
        }
      }
    }
  }
  return null;
}

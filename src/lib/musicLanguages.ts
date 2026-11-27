export const INDIA_COUNTRY_CODE = "IN";

export const MUSIC_LANGUAGE_OPTIONS = [
  { id: "hindi", label: "Hindi", acceptCode: "hi-IN", keywords: ["hindi", "bollywood", "desi"] },
  { id: "punjabi", label: "Punjabi", acceptCode: "pa-IN", keywords: ["punjabi", "bhangra", "pollywood"] },
  { id: "english", label: "English", acceptCode: "en-IN", keywords: ["english", "international", "pop"] },
  { id: "tamil", label: "Tamil", acceptCode: "ta-IN", keywords: ["tamil", "kollywood"] },
  { id: "telugu", label: "Telugu", acceptCode: "te-IN", keywords: ["telugu", "tollywood"] },
  { id: "marathi", label: "Marathi", acceptCode: "mr-IN", keywords: ["marathi"] },
  { id: "bengali", label: "Bengali", acceptCode: "bn-IN", keywords: ["bengali", "bangla"] },
  { id: "malayalam", label: "Malayalam", acceptCode: "ml-IN", keywords: ["malayalam", "mollywood"] },
  { id: "kannada", label: "Kannada", acceptCode: "kn-IN", keywords: ["kannada", "sandalwood"] },
  { id: "gujarati", label: "Gujarati", acceptCode: "gu-IN", keywords: ["gujarati", "garba"] },
  { id: "bhojpuri", label: "Bhojpuri", acceptCode: "bh-IN", keywords: ["bhojpuri"] },
] as const;

export type MusicLanguageId = (typeof MUSIC_LANGUAGE_OPTIONS)[number]["id"];

export const DEFAULT_PREFERRED_LANGUAGES: MusicLanguageId[] = ["hindi", "punjabi"];

const VALID_LANGUAGE_SET = new Set<string>(MUSIC_LANGUAGE_OPTIONS.map((item) => item.id));
const REGIONAL_LANGUAGES = new Set<string>(
  MUSIC_LANGUAGE_OPTIONS.filter((item) => item.id !== "english").map((item) => item.id)
);

const INDIA_SIGNAL_REGEX =
  /\b(india|indian|bollywood|hindi|punjabi|tamil|telugu|marathi|bengali|malayalam|kannada|gujarati|bhojpuri|desi|t-series|zee music|saregama|sony music india|tips|yrf)\b/i;

export function normalizeMusicLanguages(raw?: readonly string[] | null): MusicLanguageId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_PREFERRED_LANGUAGES];
  const out: MusicLanguageId[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const lower = String(entry || "").trim().toLowerCase();
    const mapped = lower === "international" ? "english" : lower;
    if (!VALID_LANGUAGE_SET.has(mapped) || seen.has(mapped)) continue;
    seen.add(mapped);
    out.push(mapped as MusicLanguageId);
  }
  return out.length > 0 ? out : [...DEFAULT_PREFERRED_LANGUAGES];
}

export function buildAcceptLanguageHeader(languages?: readonly string[] | null): string {
  const normalized = normalizeMusicLanguages(languages);
  const parts = ["en-IN"];
  normalized.forEach((lang, index) => {
    const option = MUSIC_LANGUAGE_OPTIONS.find((item) => item.id === lang);
    if (!option || option.acceptCode === "en-IN") return;
    const q = Math.max(0.5, 0.95 - index * 0.05).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    parts.push(`${option.acceptCode};q=${q}`);
  });
  parts.push("en;q=0.7");
  return parts.join(",");
}

function matchesWordBoundary(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

export function detectMusicLanguage(text: string): MusicLanguageId | null {
  const lowered = text.trim().toLowerCase();
  if (!lowered) return null;
  for (const option of MUSIC_LANGUAGE_OPTIONS) {
    for (const keyword of option.keywords) {
      if (matchesWordBoundary(lowered, keyword)) {
        return option.id;
      }
    }
  }
  return null;
}

export function shouldIncludeRegionalSection(
  sectionText: string,
  preferredLanguages?: readonly string[] | null
): boolean {
  const normalized = normalizeMusicLanguages(preferredLanguages);
  const preferredSet = new Set<string>(normalized);
  for (const lang of REGIONAL_LANGUAGES) {
    if (matchesWordBoundary(sectionText, lang) && !preferredSet.has(lang)) {
      return false;
    }
  }
  return true;
}

export function scoreSearchItemByIndiaAndLanguages(
  fields: {
    title?: string;
    subtitle?: string;
    language?: string;
    query: string;
  },
  preferredLanguages?: readonly string[] | null
): number {
  const preferred = normalizeMusicLanguages(preferredLanguages);
  const preferredSet = new Set<string>(preferred);
  const q = fields.query.trim().toLowerCase();
  const title = (fields.title || "").trim().toLowerCase();
  const subtitle = (fields.subtitle || "").trim().toLowerCase();
  const explicitLang = (fields.language || "").trim().toLowerCase();
  const combined = `${title} ${subtitle} ${explicitLang}`.trim();

  let score = 0;
  if (q) {
    if (title === q) score += 500;
    else if (title.startsWith(q)) score += 260;
    else if (title.includes(q)) score += 110;
    else if (subtitle.includes(q)) score += 60;
  }

  const normalizedExplicit = explicitLang === "international" ? "english" : explicitLang;
  if (normalizedExplicit && VALID_LANGUAGE_SET.has(normalizedExplicit)) {
    if (preferredSet.has(normalizedExplicit)) {
      score += 130;
    } else if (!q.includes(normalizedExplicit)) {
      score -= 25;
    }
  } else {
    const inferred = detectMusicLanguage(combined);
    if (inferred) {
      if (preferredSet.has(inferred)) score += 75;
      else if (!q.includes(inferred)) score -= 15;
    }
  }

  if (INDIA_SIGNAL_REGEX.test(combined)) {
    score += 30;
  }

  return score;
}

export function rankItemsByIndiaAndLanguages<T>(
  items: readonly T[],
  query: string,
  preferredLanguages: readonly string[] | null | undefined,
  readFields: (item: T) => { title?: string; subtitle?: string; language?: string }
): T[] {
  if (items.length <= 1) return [...items];
  return items
    .map((item, index) => ({
      item,
      index,
      score: scoreSearchItemByIndiaAndLanguages({ ...readFields(item), query }, preferredLanguages),
    }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index))
    .map((entry) => entry.item);
}

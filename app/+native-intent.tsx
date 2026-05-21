export function redirectSystemPath({
  path,
  initial,
}: { path: string; initial: boolean }) {
  const normalizedPath = normalizeAssistantPath(path);
  if (normalizedPath) return normalizedPath;

  return '/';
}

function normalizeAssistantPath(path: string): string | null {
  const raw = String(path || "").trim();
  if (!raw) return null;

  const parsed = parseIncomingPath(raw);
  if (!parsed) return null;

  const route = parsed.route.toLowerCase();
  const query = parsed.searchParams.get("q") || parsed.searchParams.get("name") || "";
  const encodedQuery = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";

  if (route === "search") return `/(tabs)/search${encodedQuery}`;
  if (route === "library") return "/(tabs)/library";
  if (route === "liked-songs" || route === "liked") return "/(tabs)/liked-songs";
  if (route === "downloads") return "/downloads";
  if (route === "downloaded-songs") return "/downloaded-songs";
  if (route === "player") return "/player";
  if (route === "queue") return "/queue";

  if (route.startsWith("feature/")) {
    return normalizeFeatureRoute(route.slice("feature/".length));
  }

  return null;
}

function parseIncomingPath(raw: string): { route: string; searchParams: URLSearchParams } | null {
  try {
    const url = new URL(raw);
    const route = [url.hostname, url.pathname.replace(/^\/+/, "")].filter(Boolean).join("/");
    return { route, searchParams: url.searchParams };
  } catch {
    const [pathname, query = ""] = raw.replace(/^\/+/, "").split("?");
    return { route: pathname, searchParams: new URLSearchParams(query) };
  }
}

function normalizeFeatureRoute(feature: string): string {
  const normalized = decodeURIComponent(feature).trim().toLowerCase().replace(/\s+/g, "-");

  if (normalized === "search") return "/(tabs)/search";
  if (normalized === "library") return "/(tabs)/library";
  if (normalized === "liked-songs" || normalized === "liked") return "/(tabs)/liked-songs";
  if (normalized === "downloads") return "/downloads";
  if (normalized === "player") return "/player";

  return "/(tabs)";
}

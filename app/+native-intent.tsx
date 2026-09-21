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
  const search = parsed.searchParams;

  // 1. Direct tab / feature matches
  if (route === "search") {
    const query = search.get("q") || search.get("name") || "";
    return query.trim() ? `/(tabs)/search?q=${encodeURIComponent(query.trim())}` : "/(tabs)/search";
  }
  if (route === "library") return "/(tabs)/library";
  if (route === "liked-songs" || route === "liked") return "/(tabs)/liked-songs";
  if (route === "downloads") return "/downloads";
  if (route === "downloaded-songs") return "/downloaded-songs";
  if (route === "player") return "/player";
  if (route === "queue") return "/queue";
  if (route === "artists") return "/artists";

  // 2. Track / Song route (checked before artist/playlist to avoid param collision with artist name)
  const isTrackRoute =
    route.startsWith("track/") ||
    route.startsWith("song/") ||
    search.has("track") ||
    search.has("song");
  if (isTrackRoute) {
    const title = search.get("title")?.trim() || "";
    const artist = search.get("artist")?.trim() || "";
    const explicitQ = search.get("q")?.trim() || "";

    let searchQuery = explicitQ;
    if (!searchQuery) {
      if (title && artist) {
        searchQuery = `${title} ${artist}`;
      } else if (title) {
        searchQuery = title;
      } else {
        const idFromRoute = route.startsWith("track/")
          ? route.slice("track/".length)
          : route.startsWith("song/")
          ? route.slice("song/".length)
          : search.get("track") || search.get("song") || "";
        searchQuery = idFromRoute;
      }
    }

    if (searchQuery) {
      return `/(tabs)/search?q=${encodeURIComponent(searchQuery)}`;
    }
    return "/(tabs)/search";
  }

  // 3. Playlist route: playlist/:id, ?playlist=:id, or ?id=:id
  const playlistId =
    search.get("playlist") ||
    (route.startsWith("playlist/") ? route.slice("playlist/".length) : route === "playlist" ? search.get("id") : null);
  if (playlistId) {
    return `/playlist/${encodeURIComponent(playlistId)}`;
  }

  // 4. Artist route: artist/:id, ?artist=:id, or ?id=:id
  const artistId =
    search.get("artist") ||
    (route.startsWith("artist/") ? route.slice("artist/".length) : route === "artist" ? search.get("id") : null);
  if (artistId) {
    return `/artist/${encodeURIComponent(artistId)}`;
  }

  // 5. Artist Mix route: artist-mix?ids=...&names=..., ?mix=1, or ?artist-mix=1
  if (route === "artist-mix" || route === "artistmix" || search.has("mix") || search.has("artist-mix")) {
    const searchString = search.toString();
    return `/artist-mix${searchString ? `?${searchString}` : ""}`;
  }

  // 6. Generic query parameter: ?q=...
  const genericQ = search.get("q") || search.get("name");
  if (genericQ && genericQ.trim()) {
    return `/(tabs)/search?q=${encodeURIComponent(genericQ.trim())}`;
  }

  if (route.startsWith("feature/")) {
    return normalizeFeatureRoute(route.slice("feature/".length));
  }

  return null;
}

function parseIncomingPath(raw: string): { route: string; searchParams: URLSearchParams } | null {
  try {
    const url = new URL(raw);
    let route = "";
    if (url.protocol === "http:" || url.protocol === "https:") {
      // For web URLs, the route path is in pathname, not hostname
      route = url.pathname.replace(/^\/+/, "");
    } else {
      // Custom scheme (e.g. mavrixfy://track/123 or mavrixfy:///track/123)
      const host =
        url.hostname && url.hostname !== "mavrixfy.site" && !url.hostname.includes("vercel.app")
          ? url.hostname
          : "";
      route = [host, url.pathname.replace(/^\/+/, "")].filter(Boolean).join("/");
    }
    return { route, searchParams: url.searchParams };
  } catch {
    const cleaned = raw.replace(/^[a-zA-Z0-9_-]+:\/\//, "").replace(/^\/+/, "");
    const [pathname, query = ""] = cleaned.split("?");
    const pathWithoutDomain = pathname.replace(/^[^/]+\//, "");
    return { route: pathWithoutDomain || pathname, searchParams: new URLSearchParams(query) };
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

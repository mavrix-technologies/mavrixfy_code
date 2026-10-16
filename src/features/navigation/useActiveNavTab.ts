import { usePathname } from "expo-router";
import { useState } from "react";
import type { VisibleRoute } from "./navTabConstants";

function tabForPath(pathname: string): VisibleRoute | null {
  if (pathname === "/" || pathname === "/index") return "index";
  if (pathname === "/search" || pathname.startsWith("/search/")) return "search";
  if (["/library", "/downloads", "/downloaded-songs"].some(path => pathname === path || pathname.startsWith(`${path}/`))) return "library";
  if (pathname === "/liked-songs" || pathname.startsWith("/liked-songs/")) return "liked-songs";
  if (pathname === "/import-songs" || pathname.startsWith("/import-songs/") || pathname.startsWith("/import-songs-file")) return "import-songs";
  return null;
}

export function useActiveNavTab(): VisibleRoute {
  const tab = tabForPath(usePathname());
  const [lastTab, setLastTab] = useState<VisibleRoute>(tab ?? "index");
  // Player/queue routes have no tab. Retain the underlying selection, including
  // during the render before the native stack freezes the covered screen.
  if (tab !== null && tab !== lastTab) setLastTab(tab);
  return tab ?? lastTab;
}

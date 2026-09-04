export type VisibleRoute = "index" | "search" | "library" | "liked-songs" | "import-songs";

export type NavItem = {
  route: VisibleRoute;
  label: string;
  icon: string;
  iconActive: string;
};

export const NAV_ITEMS: NavItem[] = [
  { route: "index", label: "Home", icon: "home-outline", iconActive: "home-sharp" },
  { route: "search", label: "Search", icon: "search-outline", iconActive: "search-sharp" },
  { route: "library", label: "Library", icon: "library-outline", iconActive: "library-sharp" },
  { route: "liked-songs", label: "Liked", icon: "heart-outline", iconActive: "heart-sharp" },
  { route: "import-songs", label: "Import", icon: "cloud-upload-outline", iconActive: "cloud-upload" },
];

export function getTabHref(route: VisibleRoute) {
  return route === "index" ? "/" : `/${route}`;
}

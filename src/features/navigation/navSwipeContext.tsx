import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type PropsWithChildren,
} from "react";
import type { HorizontalSwipeDirection } from "@/utils/horizontalPagerUtils";
import {
  canSwipeNavInDirection,
  getAdjacentNavHref,
  getAdjacentNavRoute,
  getNavTabIndex,
  type InnerHorizontalPagerBoundary,
} from "./navSwipeUtils";
import type { VisibleRoute } from "./navTabConstants";

const UNLOCKED_BOUNDARY: InnerHorizontalPagerBoundary = {
  blockPrev: false,
  blockNext: false,
};

export type NavSwipeContextValue = {
  activeTab: VisibleRoute;
  activeTabIndex: number;
  setInnerPagerBoundary: (route: VisibleRoute, boundary: InnerHorizontalPagerBoundary) => void;
  setInnerHorizontalLock: (locked: boolean) => void;
  isInnerHorizontalLocked: () => boolean;
  canSwipeInDirection: (direction: Exclude<HorizontalSwipeDirection, null>) => boolean;
  swipeToDirection: (direction: Exclude<HorizontalSwipeDirection, null>) => boolean;
};

const NavSwipeContext = createContext<NavSwipeContextValue | null>(null);

export function NavSwipeProvider({
  activeTab,
  onNavigateHref,
  children,
}: PropsWithChildren<{
  activeTab: VisibleRoute;
  onNavigateHref: (href: string, targetRoute: VisibleRoute) => void;
}>) {
  const activeTabRef = useRef<VisibleRoute>(activeTab);
  const boundaryMapRef = useRef<Partial<Record<VisibleRoute, InnerHorizontalPagerBoundary>>>({});
  const innerLockRef = useRef(false);

  useEffect(() => {
    activeTabRef.current = activeTab;
    innerLockRef.current = false;
  }, [activeTab]);

  const setInnerPagerBoundary = useCallback(
    (route: VisibleRoute, boundary: InnerHorizontalPagerBoundary) => {
      boundaryMapRef.current[route] = boundary;
    },
    []
  );

  const setInnerHorizontalLock = useCallback((locked: boolean) => {
    innerLockRef.current = locked;
  }, []);

  const isInnerHorizontalLocked = useCallback(() => innerLockRef.current, []);

  const canSwipeInDirection = useCallback(
    (direction: Exclude<HorizontalSwipeDirection, null>): boolean => {
      if (innerLockRef.current) return false;
      const route = activeTabRef.current;
      const boundary = boundaryMapRef.current[route] ?? UNLOCKED_BOUNDARY;
      return canSwipeNavInDirection(route, direction, boundary);
    },
    []
  );

  const swipeToDirection = useCallback(
    (direction: Exclude<HorizontalSwipeDirection, null>): boolean => {
      const delta: -1 | 1 = direction === "prev" ? -1 : 1;
      const route = activeTabRef.current;
      const targetRoute = getAdjacentNavRoute(route, delta);
      if (!targetRoute) return false;
      const href = getAdjacentNavHref(route, direction);
      if (!href) return false;
      onNavigateHref(href, targetRoute);
      return true;
    },
    [onNavigateHref]
  );

  const value = useMemo<NavSwipeContextValue>(
    () => ({
      activeTab,
      activeTabIndex: getNavTabIndex(activeTab),
      setInnerPagerBoundary,
      setInnerHorizontalLock,
      isInnerHorizontalLocked,
      canSwipeInDirection,
      swipeToDirection,
    }),
    [
      activeTab,
      canSwipeInDirection,
      isInnerHorizontalLocked,
      setInnerHorizontalLock,
      setInnerPagerBoundary,
      swipeToDirection,
    ]
  );

  return <NavSwipeContext.Provider value={value}>{children}</NavSwipeContext.Provider>;
}

export function useOptionalNavSwipe(): NavSwipeContextValue | null {
  return useContext(NavSwipeContext);
}

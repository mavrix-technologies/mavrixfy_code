import { useCallback, useEffect, useRef, useState } from "react";
import { PixelRatio, type LayoutRectangle, type ViewInstance } from "react-native";
import { measure, useAnimatedRef, type MeasuredDimensions } from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import { getPlayerArtworkSize } from "./usePlayerLayoutMetrics";
import { IS_WEB } from "@/constants/platform";

/** Screen coordinates include scroll offsets and transforms; local layout x/y do not. */
export function getRelativeArtworkRect(art: MeasuredDimensions, container: MeasuredDimensions,
  expectedSize: number, density: number): LayoutRectangle | null {
  "worklet";
  const x = art.pageX - container.pageX;
  const y = art.pageY - container.pageY;
  if (![x, y, art.width, art.height, container.width, container.height].every(Number.isFinite)
    || art.width <= 0 || art.height <= 0
    || Math.abs(art.width - expectedSize) > 1 || Math.abs(art.height - expectedSize) > 1
    || Math.abs(x + art.width / 2 - container.width / 2) > 1
    || y < 40 || y > 260 || y + art.height > container.height - 180) return null;
  const round = (value: number) => Math.round(value * density) / density;
  return { x: round(x), y: round(y), width: round(art.width), height: round(art.height) };
}

let cachedArtworkRect: LayoutRectangle | null = null;
let cachedArtworkViewportKey: string | null = null;

export function usePlayerArtworkMeasurement(viewport: { width: number; height: number }) {
  const contentRef = useAnimatedRef<ViewInstance>();
  const transitionArtworkRef = useAnimatedRef<ViewInstance>();
  const density = PixelRatio.get();
  const expectedSize = getPlayerArtworkSize(viewport.width, viewport.height);
  const viewportKey = `${viewport.width}x${viewport.height}`;
  const [artwork, setArtwork] = useState<LayoutRectangle | null>(() => {
    if (
      cachedArtworkRect &&
      cachedArtworkViewportKey === viewportKey &&
      Math.abs(cachedArtworkRect.width - expectedSize) <= 1 &&
      cachedArtworkRect.y >= 40 &&
      cachedArtworkRect.y <= 260
    ) {
      return cachedArtworkRect;
    }
    return null;
  });
  const pendingFrame = useRef<number | null>(null);
  const measurementVersion = useRef(0);
  const mounted = useRef(true);
  const commitArtwork = useCallback((next: LayoutRectangle, version: number) => {
    if (!mounted.current || version !== measurementVersion.current) return;
    if (next.y < 40 || next.y > 260) return;
    cachedArtworkRect = next;
    cachedArtworkViewportKey = `${viewport.width}x${viewport.height}`;
    setArtwork(previous => previous?.x === next.x && previous.y === next.y
      && previous.width === next.width && previous.height === next.height ? previous : next);
  }, [viewport.height, viewport.width]);
  const measureArtwork = useCallback(() => {
    const version = ++measurementVersion.current;
    if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current);
    let attempts = 0;
    // Bounded mount/alignment retry: never use guessed artwork coordinates.
    const retry = () => {
      if (!mounted.current || version !== measurementVersion.current || ++attempts >= 12) return;
      pendingFrame.current = requestAnimationFrame(sample);
    };
    // Let FlatList apply initialScrollIndex before measuring the fixed card slot.
    const sample = () => {
      pendingFrame.current = null;
      if (!contentRef.current || !transitionArtworkRef.current) { retry(); return; }
      if (IS_WEB) {
        contentRef.current.measureInWindow((pageX, pageY, width, height) => {
          const container = { x: 0, y: 0, pageX, pageY, width, height };
          transitionArtworkRef.current?.measureInWindow((artX, artY, artWidth, artHeight) => {
            const rect = getRelativeArtworkRect({ x: 0, y: 0, pageX: artX, pageY: artY, width: artWidth, height: artHeight },
              container, expectedSize, density);
            if (rect) commitArtwork(rect, version);
            else retry();
          });
        });
        return;
      }
      scheduleOnUI(() => {
        "worklet";
        const container = measure(contentRef);
        const art = measure(transitionArtworkRef);
        if (!container || !art) { scheduleOnRN(retry); return; }
        const rect = getRelativeArtworkRect(art, container, expectedSize, density);
        if (rect) scheduleOnRN(commitArtwork, rect, version);
        else scheduleOnRN(retry);
      });
    };
    pendingFrame.current = requestAnimationFrame(sample);
  }, [commitArtwork, contentRef, density, expectedSize, transitionArtworkRef]);
  useEffect(() => {
    mounted.current = true;
    // Also remeasure when viewport metrics change without a new card onLayout.
    measureArtwork();
    return () => {
      mounted.current = false;
      if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current);
    };
  }, [measureArtwork]);
  return { contentRef, transitionArtworkRef, artwork, measureArtwork };
}

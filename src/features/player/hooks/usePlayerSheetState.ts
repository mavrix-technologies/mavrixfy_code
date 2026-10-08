import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { collapsePlayer, playerUIStateStore, type PlayerUIState } from "@/lib/playerUIState";

/** BottomSheet owns motion; this hook only retains content and gates expensive details. */
export function usePlayerSheetState(uiState: PlayerUIState) {
  const [surface, setSurface] = useState({ retained: uiState === "expanded", ready: false });
  if (uiState === "expanded" && !surface.retained) setSurface({ retained: true, ready: false });
  const destination = useRef(0);
  // A completed close animation can enqueue onClose just as the user reopens
  // the player. Reset the destination before native callbacks can process it.
  useLayoutEffect(() => {
    if (uiState === "expanded") destination.current = 0;
  }, [uiState]);
  const onAnimate = useCallback((_from: number, to: number) => { destination.current = to; }, []);
  const onChange = useCallback((index: number) => {
    if (index === 0 && playerUIStateStore.current === "expanded") {
      destination.current = 0;
      setSurface({ retained: true, ready: true });
    }
  }, []);
  const onClose = useCallback(() => {
    if (destination.current !== -1) return;
    if (playerUIStateStore.current === "expanded") collapsePlayer();
    setSurface({ retained: false, ready: false });
  }, []);
  return { visible: uiState === "expanded" || surface.retained,
    interactionReady: surface.ready, onAnimate, onChange, onClose };
}

import { useCallback, useRef, useState } from "react";
import { collapsePlayer, playerUIStateStore, type PlayerUIState } from "@/lib/playerUIState";

/** BottomSheet owns motion; this hook only retains content and gates expensive details. */
export function usePlayerSheetState(uiState: PlayerUIState) {
  const [retained, setRetained] = useState(uiState === "expanded");
  const [interactionReady, setInteractionReady] = useState(false);
  const closingRevision = useRef<number | null>(null);
  const stateRevision = playerUIStateStore.revision;

  if (uiState === "expanded" && !retained) {
    setRetained(true);
    setInteractionReady(false);
  }

  const onAnimate = useCallback((_from: number, to: number) => {
    closingRevision.current = to === -1 ? stateRevision : null;
  }, [stateRevision]);

  const onChange = useCallback((index: number) => {
    if (index === 0 && playerUIStateStore.current === "expanded") {
      setRetained(true);
      setInteractionReady(true);
    }
  }, []);

  const onClose = useCallback(() => {
    const completedRevision = closingRevision.current;
    closingRevision.current = null;
    if (
      completedRevision === null ||
      completedRevision !== stateRevision ||
      completedRevision !== playerUIStateStore.revision
    ) return;

    if (playerUIStateStore.current === "expanded") collapsePlayer();
    setRetained(false);
    setInteractionReady(false);
  }, [stateRevision]);

  return {
    visible: uiState === "expanded" || retained,
    interactionReady,
    onAnimate,
    onChange,
    onClose,
  };
}

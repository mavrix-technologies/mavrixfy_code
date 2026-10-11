import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { collapsePlayer, playerUIStateStore, type PlayerUIState } from "@/lib/playerUIState";

/** BottomSheet owns motion; this hook only retains content and gates expensive details. */
export function usePlayerSheetState(uiState: PlayerUIState, standByActive: boolean = false, foreground: boolean = true) {
  const [retained, setRetained] = useState(uiState === "expanded");
  const [interactionReady, setInteractionReady] = useState(false);
  const closingRevision = useRef<number | null>(null);
  const stateRevision = playerUIStateStore.revision;
  const [presentation, setPresentation] = useState({ standByActive, foreground, revision: 0 });
  if (presentation.standByActive !== standByActive || presentation.foreground !== foreground) {
    setPresentation({
      standByActive, foreground,
      revision: presentation.revision + 1,
    });
    setInteractionReady(false);
  }
  const presentationRevision = presentation.revision;
  const livePresentationRevision = useRef(presentationRevision);
  useLayoutEffect(() => {
    livePresentationRevision.current = presentationRevision;
    closingRevision.current = null;
  }, [presentationRevision]);

  if (uiState === "expanded" && !retained) {
    setRetained(true);
    setInteractionReady(false);
  }
  if (uiState !== "expanded" && interactionReady) {
    setInteractionReady(false);
  }

  const onAnimate = useCallback((_from: number, to: number) => {
    if (presentationRevision !== livePresentationRevision.current || !foreground) return;
    if (standByActive && playerUIStateStore.current === "expanded") {
      closingRevision.current = null;
      return;
    }
    closingRevision.current = to === -1 ? stateRevision : null;
  }, [stateRevision, presentationRevision, foreground, standByActive]);

  const onChange = useCallback((index: number) => {
    if (presentationRevision !== livePresentationRevision.current || !foreground || standByActive) return;
    if (index === 0 && playerUIStateStore.current === "expanded" && stateRevision === playerUIStateStore.revision) {
      setRetained(true);
      setInteractionReady(true);
    }
  }, [stateRevision, presentationRevision, foreground, standByActive]);

  const onClose = useCallback(() => {
    if (presentationRevision !== livePresentationRevision.current || !foreground) return;
    if (standByActive && playerUIStateStore.current === "expanded") {
      closingRevision.current = null;
      return;
    }

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
  }, [stateRevision, presentationRevision, foreground, standByActive]);

  return {
    visible: uiState === "expanded" || retained,
    interactionReady,
    // A dismissal must reach the native sheet even if its opening animation
    // was interrupted by rotation before reporting completion.
    animateOnMount: uiState === "expanded" && !interactionReady,
    onAnimate,
    onChange,
    onClose,
  };
}

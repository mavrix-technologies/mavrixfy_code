import type { useAudioPlaybackValues } from "@/services/audio/audioPlaybackValues";
import { type ReactNode } from "react";
import {
PlayerActionsContext,
PlayerBrowseContext,
PlayerRowActionsContext,
} from "./PlayerContextDefs";

export interface PlayerContextTreeProps {
  playbackValues: ReturnType<typeof useAudioPlaybackValues>;
  children: ReactNode;
}

export function PlayerContextTree({ playbackValues, children }: PlayerContextTreeProps) {
  const {
    rowActionsValue,
    browseValue,
    actionsValue,
  } = playbackValues;

  return (
    <PlayerActionsContext.Provider value={actionsValue}>
      <PlayerBrowseContext.Provider value={browseValue}>
        <PlayerRowActionsContext.Provider value={rowActionsValue}>
          {children}
        </PlayerRowActionsContext.Provider>
      </PlayerBrowseContext.Provider>
    </PlayerActionsContext.Provider>
  );
}

import React, { type ReactNode } from "react";
import type { useAudioPlaybackValues } from "@/services/audio/audioPlaybackValues";
import {
  PlayerContext,
  PlayerLiteContext,
  PlayerProgressContext,
  PlayerRowContext,
  PlayerRowActionsContext,
  PlayerBrowseContext,
  PlayerQueueContext,
  PlayerLikedContext,
  PlayerActionsContext,
} from "./PlayerContextDefs";

export interface PlayerContextTreeProps {
  playbackValues: ReturnType<typeof useAudioPlaybackValues>;
  children: ReactNode;
}

export function PlayerContextTree({ playbackValues, children }: PlayerContextTreeProps) {
  const {
    value,
    liteValue,
    progressValue,
    rowValue,
    rowActionsValue,
    browseValue,
    queueValue,
    actionsValue,
    likedValue,
  } = playbackValues;

  return (
    <PlayerContext.Provider value={value}>
      <PlayerLiteContext.Provider value={liteValue}>
        <PlayerProgressContext.Provider value={progressValue}>
          <PlayerActionsContext.Provider value={actionsValue}>
            <PlayerLikedContext.Provider value={likedValue}>
              <PlayerBrowseContext.Provider value={browseValue}>
                <PlayerQueueContext.Provider value={queueValue}>
                  <PlayerRowActionsContext.Provider value={rowActionsValue}>
                    <PlayerRowContext.Provider value={rowValue}>
                      {children}
                    </PlayerRowContext.Provider>
                  </PlayerRowActionsContext.Provider>
                </PlayerQueueContext.Provider>
              </PlayerBrowseContext.Provider>
            </PlayerLikedContext.Provider>
          </PlayerActionsContext.Provider>
        </PlayerProgressContext.Provider>
      </PlayerLiteContext.Provider>
    </PlayerContext.Provider>
  );
}

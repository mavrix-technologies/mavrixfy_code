import React from "react";

/**
 * Official Android Auto integration in this app is handled by react-native-track-player.
 *
 * Required wiring lives in:
 * - index.js (registerPlaybackService)
 * - lib/trackPlayer.ts (updateOptions + capabilities)
 * - lib/trackPlayerService.ts (Remote* event handlers)
 * - plugins/withTrackPlayer.js + AndroidManifest.xml + automotive_app_desc.xml
 */
export const AndroidAutoIntegration = () => null;

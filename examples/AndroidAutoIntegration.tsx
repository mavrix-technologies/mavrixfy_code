import React from "react";

/**
 * Android Auto support is intentionally disabled in this app.
 *
 * The app still uses react-native-track-player for phone/background playback, but
 * it no longer advertises the Android Auto media entry points that triggered
 * Google Play's Auto quality review.
 *
 * Relevant wiring now lives in:
 * - index.js (registerPlaybackService)
 * - lib/trackPlayer.ts (playback options + capabilities)
 * - lib/trackPlayerService.ts (Remote* event handlers)
 * - plugins/withTrackPlayer.js + AndroidManifest.xml
 */
export const AndroidAutoIntegration = () => null;

/**
 * TrackPlayer Playback Service
 *
 * This is the background service registered via TrackPlayer.registerPlaybackService().
 * It handles all remote control events (lock screen, notification, headphones,
 * Bluetooth, CarPlay, Android Auto) using react-native-track-player's official API.
 *
 * Official docs: https://rntp.dev/docs/basics/playback-service
 */

import TrackPlayer, { Event, RepeatMode } from "react-native-track-player";
import { setupPlayer } from "@/lib/trackPlayer";

let pausedForDuck = false;

export const trackPlayerService = async () => {
  // Ensure player is fully set up with all capabilities before registering handlers.
  // This covers cold-start from a notification tap where the app hasn't run yet.
  try {
    await setupPlayer();
  } catch {
    // player_already_initialized is fine — just means the app already set it up
  }

  // ── Play / Pause / Stop ────────────────────────────────────────────────────
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());

  // ── Next / Previous ────────────────────────────────────────────────────────
  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    try {
      const [queue, index] = await Promise.all([
        TrackPlayer.getQueue(),
        TrackPlayer.getActiveTrackIndex(),
      ]);
      const next = (index ?? 0) + 1;
      if (next < queue.length) {
        await TrackPlayer.skip(next);
        await TrackPlayer.play();
      } else {
        const mode = await TrackPlayer.getRepeatMode();
        if (mode === RepeatMode.Queue) {
          await TrackPlayer.skip(0);
          await TrackPlayer.play();
        }
      }
    } catch { /* silent */ }
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    try {
      const progress = await TrackPlayer.getProgress();
      // If more than 3 seconds in, restart the current track
      if ((progress?.position ?? 0) > 3) {
        await TrackPlayer.seekTo(0);
        return;
      }
      const [queue, index] = await Promise.all([
        TrackPlayer.getQueue(),
        TrackPlayer.getActiveTrackIndex(),
      ]);
      const prev = (index ?? 0) - 1;
      if (prev >= 0) {
        await TrackPlayer.skip(prev);
        await TrackPlayer.play();
      } else {
        const mode = await TrackPlayer.getRepeatMode();
        if (mode === RepeatMode.Queue) {
          await TrackPlayer.skip(queue.length - 1);
          await TrackPlayer.play();
        } else {
          await TrackPlayer.seekTo(0);
        }
      }
    } catch { /* silent */ }
  });

  // ── Seek ───────────────────────────────────────────────────────────────────
  TrackPlayer.addEventListener(Event.RemoteSeek, (e) =>
    TrackPlayer.seekTo(e.position)
  );

  // ── Jump forward / backward (iOS lock screen scrubber, Android notification)
  TrackPlayer.addEventListener(Event.RemoteJumpForward, async (e) => {
    try {
      const p = await TrackPlayer.getProgress();
      await TrackPlayer.seekTo(
        Math.min((p?.position ?? 0) + (e.interval ?? 15), p?.duration ?? 0)
      );
    } catch { /* silent */ }
  });

  TrackPlayer.addEventListener(Event.RemoteJumpBackward, async (e) => {
    try {
      const p = await TrackPlayer.getProgress();
      await TrackPlayer.seekTo(
        Math.max((p?.position ?? 0) - (e.interval ?? 15), 0)
      );
    } catch { /* silent */ }
  });

  // ── Audio focus / ducking (calls, navigation, alarms) ─────────────────────
  // Official RNTP duck handling: https://rntp.dev/docs/api/events#remoteduck
  TrackPlayer.addEventListener(Event.RemoteDuck, async (e) => {
    try {
      if (e.permanent) {
        // Permanent loss (e.g. another app took over) — stop
        pausedForDuck = false;
        await TrackPlayer.stop();
      } else if (e.paused) {
        // Transient loss (e.g. navigation prompt) — pause and remember
        pausedForDuck = true;
        await TrackPlayer.pause();
      } else if (pausedForDuck) {
        // Focus returned — resume only if we paused for duck
        pausedForDuck = false;
        await TrackPlayer.play();
      }
    } catch { /* silent */ }
  });

  // ── Search / ID playback (CarPlay, Android Auto, Siri, Google Assistant) ──
  TrackPlayer.addEventListener(Event.RemotePlayId, async (e) => {
    try {
      const queue = await TrackPlayer.getQueue();
      const idx = queue.findIndex((t) => String(t.id) === String(e.id));
      if (idx >= 0) {
        await TrackPlayer.skip(idx);
        await TrackPlayer.play();
      }
    } catch { /* silent */ }
  });

  TrackPlayer.addEventListener(Event.RemotePlaySearch, async (e) => {
    try {
      const queue = await TrackPlayer.getQueue();
      if (queue.length === 0) return;
      const terms = [e.title, e.artist, e.album, e.query]
        .map((v) => String(v ?? "").toLowerCase().trim())
        .filter(Boolean);
      if (terms.length === 0) {
        await TrackPlayer.skip(0);
        await TrackPlayer.play();
        return;
      }
      const idx = queue.findIndex((t) => {
        const hay = [t.title, t.artist, t.album]
          .map((v) => String(v ?? "").toLowerCase())
          .join(" ");
        return terms.every((term) => hay.includes(term));
      });
      await TrackPlayer.skip(idx >= 0 ? idx : 0);
      await TrackPlayer.play();
    } catch { /* silent */ }
  });
};

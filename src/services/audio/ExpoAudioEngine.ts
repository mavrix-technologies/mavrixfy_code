import { createAudioPlayer, setAudioModeAsync, AudioPlayer, AudioStatus, AudioSample } from "expo-audio";
import type { Song } from "@/lib/musicData";
import { publishPlaybackAudioSample, resetPlaybackAudioLevels } from "./PlaybackAudioLevels";
import { logger } from "@/lib/logger";

export type PlaybackStatusListener = (status: {
  isPlaying: boolean;
  position: number;
  duration: number;
  isBuffering: boolean;
  isLoaded: boolean;
  didJustFinish: boolean;
}) => void;

export type PlaybackErrorListener = (error: string) => void;

class ExpoAudioEngine {
  private player: AudioPlayer | null = null;
  private currentSong: Song | null = null;
  private currentUrl: string | null = null;
  private isAudioModeConfigured = false;
  private statusListeners = new Set<PlaybackStatusListener>();
  private errorListeners = new Set<PlaybackErrorListener>();
  private activeLoadId = 0;
  private isSeeking = false;
  private targetSeekPosition = 0;

  /**
   * Configure global audio session for background playback, lock-screen controls, and interruptions.
   */
  public async ensureAudioMode(): Promise<void> {
    if (this.isAudioModeConfigured) return;

    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: "doNotMix",
        allowsRecording: false,
        shouldRouteThroughEarpiece: false,
      });
      this.isAudioModeConfigured = true;
      logger.info("[ExpoAudioEngine] Audio mode configured successfully.");
    } catch (error) {
      logger.warn("[ExpoAudioEngine] Failed to configure audio mode:", error);
    }
  }

  /**
   * Get or initialize the single long-lived AudioPlayer instance.
   */
  private getOrCreatePlayer(): AudioPlayer {
    if (this.player) return this.player;

    this.player = createAudioPlayer(null, {
      updateInterval: 250,
      downloadFirst: false,
      keepAudioSessionActive: true,
    });

    // Subscribe to native playback status updates
    this.player.addListener("playbackStatusUpdate", (status: AudioStatus) => {
      this.handlePlaybackStatusUpdate(status);
    });

    // Subscribe to native audio waveform / level samples (for visualizers)
    this.player.addListener("audioSampleUpdate", (sample: AudioSample) => {
      if (sample?.channels) {
        publishPlaybackAudioSample(sample);
      }
    });

    return this.player;
  }

  private handlePlaybackStatusUpdate(status: AudioStatus): void {
    const position = this.isSeeking ? this.targetSeekPosition : (status.currentTime || 0);
    const duration = status.duration || 0;
    const isPlaying = Boolean(status.playing);
    const isBuffering = Boolean(status.isBuffering);
    const isLoaded = Boolean(status.isLoaded);
    const didJustFinish = Boolean(status.didJustFinish);

    if (!isPlaying) {
      resetPlaybackAudioLevels();
    }

    const payload = {
      isPlaying,
      position,
      duration,
      isBuffering,
      isLoaded,
      didJustFinish,
    };

    this.statusListeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {
        logger.error("[ExpoAudioEngine] Status listener error:", err);
      }
    });
  }

  /**
   * Load and play a song with full lock-screen metadata.
   */
  public async loadAndPlay(
    song: Song,
    streamUrl: string,
    options: { shouldPlay?: boolean; initialPosition?: number } = {}
  ): Promise<void> {
    const { shouldPlay = true, initialPosition = 0 } = options;
    const loadId = ++this.activeLoadId;

    await this.ensureAudioMode();
    const player = this.getOrCreatePlayer();

    this.currentSong = song;
    this.currentUrl = streamUrl;

    try {
      // 1. Replace the audio source
      player.replace({ uri: streamUrl });

      // 2. Set native Lock Screen / Notification metadata (music player mode with Next/Previous track controls)
      try {
        player.setActiveForLockScreen(true, {
          title: song.title || "Unknown Title",
          artist: song.artist || "Unknown Artist",
          albumTitle: song.album || song.title || "Mavrixfy",
          artworkUrl: typeof song.coverUrl === "string" ? song.coverUrl : undefined,
        }, {
          showSeekForward: false,
          showSeekBackward: false,
        });
      } catch (metaErr) {
        logger.warn("[ExpoAudioEngine] Failed to set lock screen metadata:", metaErr);
      }

      // 3. Handle initial position seek if requested
      if (initialPosition > 0) {
        this.isSeeking = true;
        this.targetSeekPosition = initialPosition;
        await player.seekTo(initialPosition);
        this.isSeeking = false;
      }

      // 4. Start playback if requested and this load is still current
      if (shouldPlay && this.activeLoadId === loadId) {
        player.play();
      }
    } catch (error) {
      if (this.activeLoadId !== loadId) return; // Discard stale load error
      const message = error instanceof Error ? error.message : String(error);
      logger.error("[ExpoAudioEngine] Playback error:", message);
      this.errorListeners.forEach((l) => l(message));
      throw error;
    }
  }

  private toggleInProgress = false;

  public async play(): Promise<void> {
    if (!this.player) return;
    await this.ensureAudioMode();
    this.player.play();
  }

  public pause(): void {
    if (!this.player) return;
    this.player.pause();
    resetPlaybackAudioLevels();
  }

  public async togglePlay(): Promise<void> {
    if (this.toggleInProgress) return;
    const player = this.player;
    if (!player || !player.isLoaded) return;

    this.toggleInProgress = true;
    try {
      if (player.playing) {
        this.pause();
      } else {
        await this.play();
      }
    } finally {
      this.toggleInProgress = false;
    }
  }

  public async seekTo(seconds: number): Promise<void> {
    if (!this.player) return;
    const clampedSeconds = Math.max(0, seconds);
    this.isSeeking = true;
    this.targetSeekPosition = clampedSeconds;

    try {
      await this.player.seekTo(clampedSeconds);
    } finally {
      this.isSeeking = false;
    }
  }

  public updateLockScreenMetadata(song: Song): void {
    if (!this.player) return;
    try {
      this.player.updateLockScreenMetadata({
        title: song.title || "Unknown Title",
        artist: song.artist || "Unknown Artist",
        albumTitle: song.album || song.title || "Mavrixfy",
        artworkUrl: typeof song.coverUrl === "string" ? song.coverUrl : undefined,
      });
    } catch (err) {
      logger.warn("[ExpoAudioEngine] Failed to update lock screen metadata:", err);
    }
  }

  public clearLockScreen(): void {
    if (!this.player) return;
    try {
      this.player.clearLockScreenControls();
    } catch {}
  }

  public addStatusListener(listener: PlaybackStatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public addErrorListener(listener: PlaybackErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  public getCurrentSong(): Song | null {
    return this.currentSong;
  }

  public isPlaying(): boolean {
    return Boolean(this.player?.playing);
  }

  public getPosition(): number {
    return this.player?.currentTime || 0;
  }

  public getDuration(): number {
    return this.player?.duration || 0;
  }

  public stop(): void {
    if (!this.player) return;
    try {
      this.player.pause();
      this.player.seekTo(0);
      resetPlaybackAudioLevels();
    } catch {}
  }

  public release(): void {
    if (!this.player) return;
    try {
      this.player.clearLockScreenControls();
      this.player.remove();
      this.player = null;
      resetPlaybackAudioLevels();
    } catch {}
  }
}

export const expoAudioEngine = new ExpoAudioEngine();

import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  RepeatMode,
  Event,
  Track,
} from 'react-native-track-player';

/**
 * Setup Track Player with Android Auto & CarPlay support
 * Call this once when your app starts
 */
export async function setupPlayer() {
  let isSetup = false;
  
  try {
    // Check if already setup
    await TrackPlayer.getActiveTrackIndex();
    isSetup = true;
  } catch {
    // Setup for the first time
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
    });
    isSetup = true;
  }

  if (isSetup) {
    await TrackPlayer.updateOptions({
      // Android Auto & CarPlay capabilities
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
        alwaysPauseOnInterruption: true,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
        Capability.JumpForward,
        Capability.JumpBackward,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
      progressUpdateEventInterval: 2,
      forwardJumpInterval: 15,
      backwardJumpInterval: 15,
    });
  }

  return isSetup;
}

/**
 * Add a single track to the queue
 */
export async function addTrack(track: Track) {
  await TrackPlayer.add(track);
}

/**
 * Add multiple tracks to the queue
 */
export async function addTracks(tracks: Track[]) {
  await TrackPlayer.add(tracks);
}

/**
 * Replace the entire queue with new tracks
 */
export async function setQueue(tracks: Track[], startIndex: number = 0) {
  await TrackPlayer.reset();
  await TrackPlayer.add(tracks);
  if (startIndex > 0) {
    await TrackPlayer.skip(startIndex);
  }
}

/**
 * Play a specific track by index
 */
export async function playTrackAtIndex(index: number) {
  await TrackPlayer.skip(index);
  await TrackPlayer.play();
}

/**
 * Playback Service - handles remote controls from Android Auto, CarPlay, notifications
 * This is registered in index.js and runs in the background
 */
export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    TrackPlayer.skipToNext();
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    TrackPlayer.skipToPrevious();
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => {
    TrackPlayer.seekTo(event.position);
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    TrackPlayer.stop();
  });

  TrackPlayer.addEventListener(Event.RemoteJumpForward, async (event) => {
    const position = await TrackPlayer.getPosition();
    await TrackPlayer.seekTo(position + (event.interval || 15));
  });

  TrackPlayer.addEventListener(Event.RemoteJumpBackward, async (event) => {
    const position = await TrackPlayer.getPosition();
    await TrackPlayer.seekTo(Math.max(0, position - (event.interval || 15)));
  });

  // Optional: Handle playback errors
  TrackPlayer.addEventListener(Event.PlaybackError, (error) => {
    console.error('Playback error:', error);
  });

  // Optional: Handle track changes
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (event) => {
    if (event.track != null) {
      console.log('Now playing:', event.track);
    }
  });
}

/**
 * Helper to convert your app's track format to Track Player format
 */
export function convertToTrackPlayerTrack(song: {
  id: string;
  name: string;
  artist?: string;
  album?: string;
  artwork?: string;
  url: string;
  duration?: number;
}): Track {
  return {
    id: song.id,
    url: song.url,
    title: song.name,
    artist: song.artist || 'Unknown Artist',
    album: song.album,
    artwork: song.artwork,
    duration: song.duration,
  };
}

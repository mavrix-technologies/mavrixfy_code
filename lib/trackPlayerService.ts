import TrackPlayer, { Event } from "react-native-track-player";

async function playTrackAtIndex(index: number) {
  const queue = await TrackPlayer.getQueue();
  if (index < 0 || index >= queue.length) {
    return;
  }

  await TrackPlayer.skip(index);
  await TrackPlayer.play();
}

async function playTrackById(trackId: string) {
  const queue = await TrackPlayer.getQueue();
  const targetIndex = queue.findIndex((track) => String(track.id) === String(trackId));

  if (targetIndex < 0) {
    return;
  }

  await playTrackAtIndex(targetIndex);
}

async function playTrackFromSearch(event: any) {
  const queue = await TrackPlayer.getQueue();
  if (queue.length === 0) {
    return;
  }

  const terms = [
    event?.title,
    event?.artist,
    event?.album,
    event?.genre,
    event?.query,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  if (terms.length === 0) {
    await playTrackAtIndex(0);
    return;
  }

  const targetIndex = queue.findIndex((track) => {
    const haystack = [
      track.title,
      track.artist,
      track.album,
      track.genre,
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");

    return terms.every((term) => haystack.includes(term));
  });

  if (targetIndex >= 0) {
    await playTrackAtIndex(targetIndex);
    return;
  }

  const partialMatchIndex = queue.findIndex((track) => {
    const haystack = [
      track.title,
      track.artist,
      track.album,
      track.genre,
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");

    return terms.some((term) => haystack.includes(term));
  });

  await playTrackAtIndex(partialMatchIndex >= 0 ? partialMatchIndex : 0);
}

export const trackPlayerService = async () => {
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    await TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    await TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    await TrackPlayer.stop();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    try {
      await TrackPlayer.skipToNext();
      await TrackPlayer.play();
    } catch {
      // Silent fail when the queue is already at the end.
    }
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    try {
      const progress = await TrackPlayer.getProgress();
      if ((progress?.position ?? 0) > 3) {
        await TrackPlayer.seekTo(0);
        return;
      }

      await TrackPlayer.skipToPrevious();
      await TrackPlayer.play();
    } catch {
      try {
        await TrackPlayer.seekTo(0);
      } catch {
        // Silent fail
      }
    }
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, async (event) => {
    await TrackPlayer.seekTo(event.position);
  });

  TrackPlayer.addEventListener(Event.RemoteSkip, async (event) => {
    await playTrackAtIndex(event.index);
  });

  TrackPlayer.addEventListener(Event.RemotePlayId, async (event) => {
    await playTrackById(event.id);
  });

  TrackPlayer.addEventListener(Event.RemotePlaySearch, async (event) => {
    await playTrackFromSearch(event);
  });
};

const test = require('node:test');
const assert = require('node:assert/strict');

// We test providerFilter directly
function getSongProvider(song) {
  if (!song) return "jiosaavn";
  if (
    song.source === "local" ||
    (typeof song.audioUrl === "string" && (song.audioUrl.startsWith("file://") || song.audioUrl.startsWith("/")))
  ) {
    return "local";
  }
  if (
    song.source === "spotify" ||
    (typeof song.id === "string" && (song.id.startsWith("pl_") || song.id.startsWith("sp_"))) ||
    (typeof song.playlistId === "string" &&
      (song.playlistId.startsWith("pl_") || song.playlistId.startsWith("sp_")))
  ) {
    return "spotify";
  }
  if (
    song.source === "youtube" ||
    (typeof song.id === "string" && song.id.startsWith("youtube_")) ||
    Boolean(song.youtubeVideoId || song.videoId)
  ) {
    return "youtube";
  }
  return "jiosaavn";
}

function isSongProviderAllowed(song, settings) {
  if (!song) return true;
  const provider = getSongProvider(song);
  if (provider === "local") return true;
  if (!settings) return true;
  if (provider === "spotify") return settings.enableSpotify !== false;
  if (provider === "youtube") return settings.enableYouTubeMusic !== false;
  if (provider === "jiosaavn") return settings.enableJioSaavn !== false;
  return true;
}

function isPlaylistProviderAllowed(playlistId, settings) {
  if (!playlistId || !settings) return true;
  if (playlistId.startsWith("pl_") || playlistId.startsWith("sp_")) {
    return settings.enableSpotify !== false;
  }
  if (playlistId.startsWith("youtube_") || playlistId.startsWith("VL") || playlistId.startsWith("RD")) {
    return settings.enableYouTubeMusic !== false;
  }
  return settings.enableJioSaavn !== false;
}

test('Music Provider Classification and Toggle Blocking', () => {
  const spotifyTrack = { id: 'pl_track_1', title: 'Spotify Hit', source: 'spotify' };
  const ytTrack = { id: 'youtube_abc123', title: 'YouTube Track', source: 'youtube' };
  const jioTrack = { id: 'YiVML4Zo', title: 'JioSaavn Hit', source: 'jiosaavn' };

  // All enabled
  const allOn = { enableJioSaavn: true, enableSpotify: true, enableYouTubeMusic: true };
  assert.equal(isSongProviderAllowed(spotifyTrack, allOn), true);
  assert.equal(isSongProviderAllowed(ytTrack, allOn), true);
  assert.equal(isSongProviderAllowed(jioTrack, allOn), true);

  // Spotify OFF
  const spotifyOff = { enableJioSaavn: true, enableSpotify: false, enableYouTubeMusic: true };
  assert.equal(isSongProviderAllowed(spotifyTrack, spotifyOff), false, 'Spotify song must be blocked when Spotify toggle is OFF');
  assert.equal(isSongProviderAllowed(ytTrack, spotifyOff), true);
  assert.equal(isSongProviderAllowed(jioTrack, spotifyOff), true);

  // YouTube Music OFF
  const ytOff = { enableJioSaavn: true, enableSpotify: true, enableYouTubeMusic: false };
  assert.equal(isSongProviderAllowed(ytTrack, ytOff), false, 'YouTube song must be blocked when YouTube toggle is OFF');
  assert.equal(isSongProviderAllowed(spotifyTrack, ytOff), true);
  assert.equal(isSongProviderAllowed(jioTrack, ytOff), true);

  // JioSaavn OFF
  const jioOff = { enableJioSaavn: false, enableSpotify: true, enableYouTubeMusic: true };
  assert.equal(isSongProviderAllowed(jioTrack, jioOff), false, 'JioSaavn song must be blocked when JioSaavn toggle is OFF');
  assert.equal(isSongProviderAllowed(spotifyTrack, jioOff), true);
  assert.equal(isSongProviderAllowed(ytTrack, jioOff), true);
});

test('Playlist Provider Classification and Content Cut', () => {
  const spotifyPl = 'pl_trending_india';
  const ytPl = 'youtube_playlist_xyz';
  const jioPl = '114983271';

  const spotifyOff = { enableJioSaavn: true, enableSpotify: false, enableYouTubeMusic: true };
  assert.equal(isPlaylistProviderAllowed(spotifyPl, spotifyOff), false);
  assert.equal(isPlaylistProviderAllowed(ytPl, spotifyOff), true);
  assert.equal(isPlaylistProviderAllowed(jioPl, spotifyOff), true);

  const ytOff = { enableJioSaavn: true, enableSpotify: true, enableYouTubeMusic: false };
  assert.equal(isPlaylistProviderAllowed(ytPl, ytOff), false);
  assert.equal(isPlaylistProviderAllowed(spotifyPl, ytOff), true);
  assert.equal(isPlaylistProviderAllowed(jioPl, ytOff), true);

  const jioOff = { enableJioSaavn: false, enableSpotify: true, enableYouTubeMusic: true };
  assert.equal(isPlaylistProviderAllowed(jioPl, jioOff), false);
  assert.equal(isPlaylistProviderAllowed(spotifyPl, jioOff), true);
  assert.equal(isPlaylistProviderAllowed(ytPl, jioOff), true);
});

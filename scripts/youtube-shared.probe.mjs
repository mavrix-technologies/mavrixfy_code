// Live check of the SAME transport used by the app. Never print signed URLs.
import fs from "node:fs/promises";
import { Buffer } from "node:buffer";
import { loadYouTubeNodeTransport } from "./helpers/youtube-node-transport.mjs";
const api = await loadYouTubeNodeTransport();
try {
  if (process.argv[2] === "--video") {
    const quality = process.argv[4] || "low";
    const stream = await api.resolveVideoStream(process.argv[3] || "Ci0WbaUH3no", quality, "probe-video");
    console.log(JSON.stringify({ height: stream.height, codec: stream.codec, client: stream.clientProfile }));
    const response = await fetch(stream.url, { headers: stream.headers, signal: AbortSignal.timeout(12000) });
    console.log(JSON.stringify({ videoGetStatus: response.status, mime: response.headers.get("content-type") }));
    await response.body?.cancel();
    const ceiling = quality === "low" ? 360 : quality === "medium" ? 480 : quality === "auto" ? 720 : Infinity;
    if (!response.ok || stream.height > ceiling) throw new Error("Video stream validation failed");
  } else if (process.argv[2] === "--explore") {
    const explore = await api.explore("probe-explore");
    console.log(JSON.stringify({ sections: explore.sections.map(section => ({ title: section.title, category: section.category,
      songs: section.songs.length, items: section.playlists.map(item => ({ name: item.name, kind: item.kind, id: item.id })) })) }));
    const album = explore.playlists.find(item => item.kind === "album");
    if (album) {
      const result = await api.playlist(album.id, "", "probe-album");
      console.log(JSON.stringify({ album: result.name, songs: result.songs.length, firstSong: result.songs[0]?.title }));
      if (!result.songs.length) throw new Error("Empty album");
    }
  } else if (process.argv[2] === "--home") {
    const home = await api.home("probe-home");
    console.log(JSON.stringify({ homeSongs: home.songs.length, homePlaylists: home.playlists.length,
      sectionCount: home.sections?.length, shelves: home.sections?.map(section => ({ title: section.title, songs: section.songs.length, playlists: section.playlists.length })),
      playlistNames: home.playlists.slice(0, 3).map(item => ({ name: item.name, ownerName: item.ownerName, ownerChannelId: item.ownerChannelId })) }));
    if (!home.songs.length && !home.playlists.length) throw new Error("Empty YouTube home feed");
    if (home.playlists.length) {
      const page = await api.playlist(home.playlists[0].id, "", "probe-home-mix");
      console.log(JSON.stringify({ mixSongs: page.songs.length, firstSong: page.songs[0]?.title }));
      if (process.argv.includes("--artwork")) {
        const { youTubeDisplayArtworkUrl } = await import(new URL("../.expo/youtube-artwork-probe.mjs", import.meta.url));
        const jpeg = (await import("jpeg-js")).default;
        for (const [kind, url] of [["playlist", home.playlists[0].coverUrl], ["song", page.songs[0]?.coverUrl]]) {
          if (!url) throw new Error(`No ${kind} artwork`);
          for (const pixels of [192, 1200]) {
            const response = await fetch(youTubeDisplayArtworkUrl(url, pixels), { signal: AbortSignal.timeout(12000) });
            if (!response.ok) throw new Error(`${kind} artwork HTTP ${response.status}`);
            const bytes = Buffer.from(await response.arrayBuffer());
            const decoded = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 96 });
            console.log(JSON.stringify({ artwork: kind, requested: pixels, width: decoded.width, height: decoded.height, bytes: bytes.length }));
            if (pixels === 1200) await fs.writeFile(new URL(`../.expo/youtube-${kind}-artwork.jpg`, import.meta.url), bytes);
          }
        }
      }
    }
  } else {
  const results = await api.search(process.argv[2] || "Majboor unplugged", "all", "probe-search");
  console.log(JSON.stringify({ songs: results.songs.length, playlists: results.playlists.length,
    firstSongs: results.songs.slice(0, 3).map(({ videoId, title, artist, duration }) => ({ videoId, title, artist, duration })) }));
  if (!results.songs.length || !results.playlists.length) throw new Error("Search returned no content");
  let page = await api.playlist(results.playlists[0].id, "", "probe-playlist");
  console.log(JSON.stringify({ playlistSongs: page.songs.length, hasMore: !!page.cursor, name: page.name }));
  if (!page.songs.length) throw new Error("Empty playlist");
  if (page.cursor) {
    page = await api.playlist(results.playlists[0].id, page.cursor, "probe-page2");
    console.log(JSON.stringify({ continuationSongs: page.songs.length }));
  }
  const videoId = process.argv[3] || results.songs[0].videoId;
  const start = Date.now();
  const stream = await api.resolveStream(videoId, "medium", "probe-stream");
  console.log(JSON.stringify({ videoId, client: stream.clientProfile, bitrate: stream.bitrate,
    resolutionMs: Date.now() - start, expiresAt: stream.expiresAt, durationSeconds: stream.durationSeconds }));
  const response = await fetch(stream.url, { headers: stream.headers, signal: AbortSignal.timeout(12000) });
  console.log(JSON.stringify({ unrestrictedGetStatus: response.status, mime: response.headers.get("content-type") }));
  await response.body?.cancel();
  if (!response.ok) throw new Error(`Unrestricted GET ${response.status}`);
  const related = await api.related(videoId, "probe-related");
  console.log(JSON.stringify({ relatedSongs: related.length }));
  if (!related.length) throw new Error("No related content");
  }
} catch (error) {
  console.error(String(error).replace(/https?:\/\/[^\s"']+/g, "[URL]"));
  process.exitCode = 1;
}

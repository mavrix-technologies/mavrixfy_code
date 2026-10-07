// Live check of the SAME transport used by the app. Never print signed URLs.
import fs from "node:fs/promises";
import ts from "typescript";
import { webcrypto } from "node:crypto";
import { Event, EventTarget } from "event-target-shim";
globalThis.crypto ??= webcrypto;
globalThis.EventTarget ??= EventTarget;
globalThis.CustomEvent ??= class extends Event {
  constructor(type, options = {}) { super(type, options); this.detail = options.detail; }
};
const source = await fs.readFile(new URL("../src/services/youtube/SharedYouTubeTransport.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022,
} }).outputText.replace('import "./runtime";', "").replace('"./YouTubeArtwork"', '"./youtube-artwork-probe.mjs"');
const artifact = new URL("../.expo/youtube-shared-probe.mjs", import.meta.url);
await fs.mkdir(new URL("../.expo/", import.meta.url), { recursive: true });
const artworkSource = await fs.readFile(new URL("../src/services/youtube/YouTubeArtwork.ts", import.meta.url), "utf8");
await fs.writeFile(new URL("../.expo/youtube-artwork-probe.mjs", import.meta.url), ts.transpileModule(artworkSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText);
await fs.writeFile(artifact, output);
const { sharedYouTubeTransport: api } = await import(artifact.href);
try {
  if (process.argv[2] === "--home") {
    const home = await api.home("probe-home");
    console.log(JSON.stringify({ homeSongs: home.songs.length, homePlaylists: home.playlists.length,
      playlistNames: home.playlists.slice(0, 3).map(item => item.name) }));
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
    firstSongs: results.songs.slice(0, 3).map(({ videoId, title, artist }) => ({ videoId, title, artist })) }));
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
    resolutionMs: Date.now() - start, expiresAt: stream.expiresAt }));
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

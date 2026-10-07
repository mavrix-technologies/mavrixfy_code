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
} }).outputText.replace('import "./runtime";', "");
const artifact = new URL("../.expo/youtube-shared-probe.mjs", import.meta.url);
await fs.mkdir(new URL("../.expo/", import.meta.url), { recursive: true });
await fs.writeFile(artifact, output);
const { sharedYouTubeTransport: api } = await import(artifact.href);
try {
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
} catch (error) {
  console.error(String(error).replace(/https?:\/\/[^\s"']+/g, "[URL]"));
  process.exitCode = 1;
}

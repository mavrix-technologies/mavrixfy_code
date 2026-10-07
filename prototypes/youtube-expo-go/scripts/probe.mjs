import fs from 'node:fs/promises';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
import { Event, EventTarget } from 'event-target-shim';

globalThis.crypto ??= webcrypto;
globalThis.EventTarget ??= EventTarget;
globalThis.CustomEvent ??= class extends Event {
  constructor(type, options = {}) { super(type, options); this.detail = options.detail; }
};
const source = await fs.readFile(new URL('../src/youtube.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const artifact = new URL('../.expo/probe-service.mjs', import.meta.url);
await fs.mkdir(new URL('../.expo/', import.meta.url), { recursive: true });
await fs.writeFile(artifact, output);
const api = await import(artifact.href);
try {
  const results = await api.searchYouTube(process.argv[2] || 'Majboor unplugged');
  console.log(JSON.stringify({ songs: results.songs.length, playlists: results.playlists.length, firstSongs: results.songs.slice(0, 3) }));
  if (results.playlists[0]) {
    const playlist = await api.loadPlaylist(results.playlists[0].id);
    console.log(JSON.stringify({ playlistSongs: playlist.songs.length, hasMore: playlist.hasMore }));
    if (!playlist.songs.length) throw new Error('Playlist did not return tracks');
  }
  const selected = process.argv[3] || results.songs[0]?.videoId;
  if (!selected) throw new Error('No songs found');
  const stream = await api.resolveStream(selected, console.log);
  console.log(JSON.stringify({ videoId: selected, client: stream.client, bitrate: stream.bitrate, expiresAt: stream.expiresAt, audioHttp: 'passed' }));
  for (const mode of ['full', 'openRange', 'boundedRange', 'queryRange']) {
    const target = new URL(stream.url);
    if (mode === 'queryRange') target.searchParams.set('range', '0-');
    const headers = { ...stream.headers };
    if (mode === 'openRange') headers.Range = 'bytes=0-';
    if (mode === 'boundedRange') headers.Range = 'bytes=0-3000000';
    const response = await fetch(target, { headers, signal: AbortSignal.timeout(12000) });
    console.log(JSON.stringify({ mode, status: response.status, type: response.headers.get('content-type') }));
    await response.body?.cancel();
  }
} catch (error) { console.error(api.safeError(error)); process.exitCode = 1; }

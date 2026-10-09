// Node adapter for the app's actual YouTube transport; no duplicate catalog parser.
import fs from "node:fs/promises";
import ts from "typescript";
import { webcrypto } from "node:crypto";
import { Event, EventTarget } from "event-target-shim";
export async function loadYouTubeNodeTransport() {
  globalThis.crypto ??= webcrypto;
  globalThis.EventTarget ??= EventTarget;
  globalThis.CustomEvent ??= class extends Event {
    constructor(type, options = {}) { super(type, options); this.detail = options.detail; }
  };
  const source = await fs.readFile(new URL("../../src/services/youtube/SharedYouTubeTransport.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022,
  } }).outputText.replace('import "./runtime";', "")
    .replace('import { fetch as streamFetch } from "expo/fetch";', 'const streamFetch = globalThis.fetch;')
    .replace('"./YouTubeArtwork"', '"./youtube-artwork-probe.mjs"')
    .replace('"./YouTubeArtists"', '"./youtube-artists-probe.mjs"')
    .replace('"./YouTubeVideoFormats"', '"./youtube-video-formats-probe.mjs"')
    .replace('"./officialMusicVideo"', '"./youtube-official-video-probe.mjs"');
  // Node probes have no native WebView host. A null proof preserves the direct
  // path; attestation must be verified inside an Android/iOS runtime.
  const nativeOutput = output.replace('import { youtubePoTokens } from "./YouTubePoToken";', 'const youtubePoTokens = { mint: async () => null };');
  const artifact = new URL("../../.expo/youtube-shared-probe.mjs", import.meta.url);
  await fs.mkdir(new URL("../../.expo/", import.meta.url), { recursive: true });
  const artworkSource = await fs.readFile(new URL("../../src/services/youtube/YouTubeArtwork.ts", import.meta.url), "utf8");
  await fs.writeFile(new URL("../../.expo/youtube-artwork-probe.mjs", import.meta.url), ts.transpileModule(artworkSource, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText);
  await fs.writeFile(artifact, nativeOutput);
  await fs.writeFile(new URL("../../.expo/youtube-artists-probe.mjs", import.meta.url), ts.transpileModule(await fs.readFile(new URL("../../src/services/youtube/YouTubeArtists.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText);
  await fs.writeFile(new URL("../../.expo/youtube-video-formats-probe.mjs", import.meta.url), ts.transpileModule(await fs.readFile(new URL("../../src/services/youtube/YouTubeVideoFormats.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText);
  await fs.writeFile(new URL("../../.expo/youtube-official-video-probe.mjs", import.meta.url), ts.transpileModule(await fs.readFile(new URL("../../src/services/youtube/officialMusicVideo.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText);
  const { sharedYouTubeTransport: api } = await import(artifact.href);

  return api;
}

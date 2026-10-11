# Streaming, downloads, effects, secondary audio audit

Final integration note: this is scoped investigation evidence; the parent [complete audit](../audio-engine-audit.md) supersedes intermediate counts/results. The reported native fast-skip bypass is fixed by comparing the resolved URL with the queued URL before skip. StandardAudioPlayer also now revalidates managed local files on each selection/automatic advancement and publishes the selected target before its validation error, so UI error ownership stays aligned. All 409 tests pass in the combined final behavioral run. Concurrent package/UI changes were preserved and are outside this subtask's attribution.

Audit date: 2026-10-10. Workspace: `E:\Mavrixfy\Mavrixfy_App`. This report is the streaming/effects subagent evidence for integration into the complete audio audit. It does not claim physical-device playback or iOS compilation.

## Scope and ownership

Reviewed catalog source/quality normalization, active and legacy YouTube extractors, download URL handling and queue, local-file/license resolution, equalizer configuration/math/application, visual video routing, push notifications and the CarPlay JS bridge. Root owns `PlayerPlaybackResolver.ts`, `StandardAudioPlayer.tsx`, `ExpoAvAdapter.ts` and `PlaybackEngine.ts`; app-flow owns hooks/queue/quality changes; native agent owns Kotlin/Objective-C edits and patch regeneration. No competing edits to these owned files were made here.

Files changed by this subagent:

- `src/lib/musicData.ts`
- `src/lib/downloads/audioQuality.ts`
- `src/lib/downloads/downloadManager.ts`
- `src/lib/downloads/downloadQueue.ts`
- `src/lib/downloads/licenseSync.ts`
- `scripts/performance.regression.test.cjs`
- `scripts/download-audio.regression.test.cjs` (new)
- `scripts/offline-license.regression.test.cjs` (new)

No `AGENTS.md` was found by `rg --files --hidden -g AGENTS.md -g '!node_modules' -g '!.git'`. The working tree was initially clean. Existing package-lock/dependencies were not upgraded or changed.

## Actual runtime and implementation

The installed/locked versions are Expo 57.0.27, React Native 0.86.3, React 19.2.3, expo-audio 57.0.5, expo-file-system 57.0.6, react-native-audio-api 0.13.6, youtubei.js 18.1.0, TypeScript 6.0.3, Firebase 12.16.0. Historical SDK 54 wording is not evidence of the current build.

Custom native builds use `StandardAudioPlayer` backed by react-native-audio-api. Expo Go uses `ExpoAvAdapter`, whose implementation imports `expo-audio`, despite its historical filename. Equalizer support deliberately requires a custom iOS/Android runtime; Expo Go/web does not implement the native effects graph.

Active YouTube resolution lives in `src/services/youtube/YouTubeMusic.ts`, its shared extractor/transport and proof host. It uses shared JavaScript youtubei.js extraction, not the registered legacy native extractor bridge. The legacy Android/iOS modules are still configured by `app.json`, `plugins/withYouTubeMusic.js`, Android MainApplication and native smoke scripts. Source search found no direct `src` NativeModules.MavrixfyYouTube caller. They were retained because removing registered native/configuration code requires a coordinated platform build; they are URL providers, not extra playback engines.

## Confirmed defects and changes

### Catalog quality reporting and candidate selection

`getBestAudioUrl` previously ranked only the hardcoded 320/160/96/48/12 ladder, placing a valid 256 kbps candidate after 160 kbps. It now sorts by the parsed numeric bitrate. Raw string URLs previously acquired a fabricated `320kbps` label during normalization, and a fallback with unknown bitrate could report 160 kbps. Unknown labels now remain unknown (`0` / `Original audio`); known labels report their actual parsed value. Preferred resolution still selects an explicitly available preferred label and falls back to actual available audio.

Deleted `QUALITY_LADDER`, whose whole-repository search found only its definition. Deleted an unreachable literal fallback map in `parseBitrate`: every key already matched the preceding numeric regex. Other quality constants/compatibility exports were retained when callers existed.

Regression assertions cover 256 vs 160 ordering, unknown raw source quality, preferred/fallback labels and numeric parsing. No claim is made that selecting a URL guarantees the CDN actually delivers its advertised bitrate.

### Download URL corruption

`getAudioUrlByQuality` rewrote `_320`, `_160` and related substrings in arbitrary URLs, including signed Googlevideo URLs and query tokens. It now rewrites only HTTP(S) audio paths on explicitly recognized JioSaavn CDN domains using hostname equality/domain boundaries. Original query/fragment bytes remain unchanged. Existing JioSaavn low/medium/high path substitutions remain compatible; unrelated hosts remain byte-for-byte unchanged. Tests include a signed URL, misleading host names and provider path variants.

### Managed local files bypassed status and account changes

`getLocalPlaybackUrl` allowed the generic filesystem-recovery path even when the managed record was revoked, expired, deleted or otherwise not completed. A file remained playable after its managed status changed. It now rejects any explicit managed non-completed record and preserves older orphan-file recovery only when no managed record exists. It uses the exported license-grace constant rather than a duplicated literal. Account scope is captured before asynchronous filesystem reads and rechecked before returning a URL; a result from the prior account is discarded.

Root separately fixed `PlayerPlaybackResolver` direct-file fallback: managed rejected local URLs cannot be revived by retained Song snapshots. The app-flow agent added cache revalidation for file/content/absolute cached URLs. Independent combined-diff review identified `playSong` native synchronized-queue fast path ignoring its newly resolved URL; app-flow now checks the existing native target URL and rebuilds when it differs. Root additionally added select-time managed file validation with selection/version guards in StandardAudioPlayer, covering automatic advance and remote Next through existing native queue entries. Root's engine regression revokes an already queued local target before automatic advance. These protections are coordinated changes outside this subagent's owned download files.

Tests cover completed, invalid status, missing record recovery, grace expiry, and an account change during file validation. Device-level license/revocation timing remains unverified.

### Download pause/cancel races and slot ownership

Download preparation and native transport are asynchronous. A late source rejection after Pause previously changed status back to queued and scheduled an automatic retry, undoing the user action. Pause/cancel now persist intent before awaiting native operations. Late failures are handled only if the current record is still downloading and the queue is not suspended. Failed native pause/cancel calls preserve the intended paused/deleted state; completed native results arriving after intent changes are discarded/deleted.

Only the launched-task finalizer releases its concurrency slot. Cancel no longer releases a slot while its source-resolution task is still in flight. This prevents oversubscription, while maintaining a two-download limit. Retries remain bounded at three scheduled retries (2, 5 and 10 seconds), with terminal error on the fourth failure.

The catalog refresh timeout previously stopped as soon as HTTP headers arrived, leaving a hung JSON body unbounded. Its 8-second abort timer now covers response parsing and source selection too. The existing original-URL fallback remains available after refresh failure. HTTP success and non-text/non-JSON/XML validation remain in place before file finalization.

The final review also reproduced Pause/Cancel during asynchronous file promotion being overwritten by completion. A promotion-boundary intent/suspension check and expected-status commit now prevent completed/failed from reviving the abandoned transfer; any promoted abandoned file is removed. Optional artwork kickoff now follows the guarded completion rather than adding another await before it. Two regression assertions failed before this final fix and now pass (`promotion-before-fix.log`).

Tests exercise late source rejection after Pause, native pause/cancel rejection, bounded retry count, two occupied slots, timeout through a pending JSON body and user action during file promotion. The VM harness simulates installed API contracts; it cannot prove background download behavior on an OS.

### Callable license denial was misclassified

Firebase FunctionsError is constructed as `${FUNCTIONS_TYPE}/${code}` in the installed Firebase functions SDK. Therefore real denial codes are `functions/permission-denied`, `functions/resource-exhausted`, and `functions/unauthenticated`. `issueOfflineLicense` previously compared only unprefixed codes and treated these denials as unavailable-server errors, issuing a local fallback license. It now normalizes the `functions/` prefix before classifying denials, and propagates the original error without local fallback.

The explicitly retained product policy still issues a local 30-day license when the license endpoint is unavailable (for example `functions/not-found`). The fallback record currently sets `issuedByServer: true`, although it was generated locally. This is an existing provenance-semantic issue; it is not used as the current playback authorization gate and was not changed because root requested preserving fallback policy. It should be corrected with a separate model/server policy migration if used for provenance.

Seven regressions test plain/prefixed explicit denials and retained unavailable-server fallback. Firebase source evidence: `node_modules/@firebase/functions/dist/esm/index.esm.js`, `FunctionsError` constructor (`super(`${FUNCTIONS_TYPE}/${code}`, ...)`).

### Baseline performance fixtures

The baseline suite failed on two stale fixtures, rather than demonstrated runtime failures: `PlayerScreen` now imports `@/lib/queueRef`, which the VM fixture did not provide, and the test still loaded deleted `PlayerQueueList.tsx`. The PlayerScreen fixture now supplies queueRef/useRef. The queue test now loads actual `QueueBottomSheet` QueueContent through a VM-only export, asserts 10,000 data entries are retained, verifies native virtualization limits and checks exact representative rendered positions. Removed assertions against the deleted custom-windowing implementation were replaced with meaningful current behavior assertions.

## Reviewed paths with no confirmed correction required here

### YouTube resolution and transport

The active wrapper has a 26-second request ceiling, request cancellation, bounded/coalesced per-quality stream cache, a two-minute expiry window and current-promise guards so invalidated older results do not overwrite current cache. The extractor tries a bounded client plan (at most two rounds), performs bounded candidate validation and selects native-compatible audio/mp4 AAC or video/mp4 H.264 when necessary. Shared HTTP transport applies 6-second player-script/12-second other-response timeouts through body reads, with a bounded player-script cache (24 entries). Candidate validation uses an abortable 5-second GET rather than relying on HEAD. Underlying youtubei basic-info work does not always accept the caller cancellation signal directly; transport deadlines still bound its requests, and result/deadline checks suppress obsolete work. Provider IP blocking, token/verification requirements and YouTube private API changes are external runtime limitations. No live external extraction success was inferred from fixture tests.

Legacy provider dependencies include Android NewPipeExtractor 0.26.5/innertubex 0.4.1/ktor 3.5.2 and a pinned iOS YouTubeKit commit; these are legacy configured extractors. Their native compilation/device behavior belongs in the native report.

### Equalizer and clipping

Reviewed `equalizerConfig.ts`, `equalizerDsp.ts`, `audioEqualizer.ts` and StandardAudioPlayer graph application against installed react-native-audio-api 0.13.6 C++ `BiquadFilterNode::getPeakingCoefficients`. Both implementations use peaking coefficients with A=10^(gain/40), sin(w0)/(2Q) and matching denominator normalization. The 15 bands span 25–16000 Hz, gains clamp at +/-8 dB, Q is sqrt(2), invalid/near-Nyquist bands are bypassed, disabled/flat settings route around the equalizer, and output headroom derives from sampled combined frequency response plus 0.75 dB safety margin. Existing equalizer regression tests validate frequency responses, low-sample-rate behavior, normalization, presets and bypass state.

Settings normalization and preview revision guards prevent an older persisted restore from overriding a newer preview. No confirmed math or API mismatch was found, so no equalizer code was changed. The sampled-response headroom is a calculated bound, not a measurement of every device/source; limiter/surround/spatial processing is not present. Do not claim spatial audio or guaranteed distortion-free output for every signal/device.

### Secondary routes

`BackgroundYoutubeVideo.tsx` explicitly sets muted=true, volume=0, mixWithOthers, no now-playing notification and no background activity. It is a visual path and does not intentionally compete with song audio. `notificationService.ts` handles app push/update notifications, distinct from native playback notification controls. `carPlayService.ts` guards native availability and tears down its registered JS event subscriptions. Native CarPlay implementation/entitlements and real car routing remain platform verification requirements. `downloads/storagePolicy.ts` is an actively imported compatibility re-export and was retained.

## Baseline and scoped verification

Baseline commands were launched independently in parallel and preserved in `outputs/audio-audit/`:

| Command | Outcome | Log |
|---|---|---|
| `npm.cmd test` | Exit 1; 343/345 passed, two stale performance fixtures | `baseline-test.log` |
| `npm.cmd run typecheck` | Exit 0 | `baseline-typecheck.log` |
| `npm.cmd run lint` | Exit 0; 17 warnings, no errors | `baseline-lint.log` |
| `npm.cmd ls --all` | Exit 1; two peer declaration inconsistencies below | `baseline-dependencies.log` |

Scoped commands after fixes:

- `node --test scripts/performance.regression.test.cjs`: 9/9 passed.
- `node --test scripts/download-audio.regression.test.cjs scripts/offline-license.regression.test.cjs`: 20/20 passed before the two final promotion regressions (13 download/audio, 7 license).
- `node --test scripts/download-audio.regression.test.cjs scripts/offline-license.regression.test.cjs scripts/performance.regression.test.cjs`: final 31/31 passed (15 download/audio, 7 license, 9 performance), `streaming-final-tests.log`.
- `node --test scripts/download-audio.regression.test.cjs scripts/performance.regression.test.cjs scripts/equalizer.regression.test.cjs scripts/youtube-music.regression.test.cjs scripts/youtube-transport.regression.test.cjs`: 87/87 passed before the final additional JSON-body timeout/license assertions; `streaming-effects-tests.log`.
- `node node_modules/eslint/bin/eslint.js src/lib/musicData.ts src/lib/downloads/audioQuality.ts src/lib/downloads/downloadManager.ts src/lib/downloads/downloadQueue.ts`: exit 0, no warnings; `streaming-effects-lint.log`.
- Final targeted ESLint includes all five edited TypeScript files (above plus licenseSync), exit 0/no warnings, `streaming-final-lint.log`.
- `npm.cmd run typecheck`: exit 0 after the main streaming fixes; `streaming-effects-typecheck.log`.
- Final `npm.cmd run typecheck` after promotion/license fixes: exit 0, `streaming-final-typecheck.log`.

The new download regressions were also run against source snapshots from `git show HEAD:<file>`: original sources failed six assertions and passed six. Proven failures were 256kbps ranking, fabricated bitrate, arbitrary signed URL mutation, revoked managed-file recovery, stale account return and Pause being overwritten by late failure. Evidence: `baseline-source-regressions.log`; source snapshots and a temporary matching test harness are in the same outputs folder. Final combined full-suite/type/lint/native results should come from root/native-agent logs, not these intermediate scoped counts.

## Dependency consistency assessment

`npm ls --all` and `npm ls --omit=optional --all` both fail on pre-existing declarations:

1. react-native-worklets 0.10.1 declares peer `@react-native/metro-config: *`, which is absent from both installed tree and lockfile. The app uses `expo/metro-config`; loading actual `metro.config.js` succeeded with resolver/transformer present. Worklets' installed JavaScript/TypeScript sources do not import `@react-native/metro-config`; its bundleMode helpers operate on passed configuration/resolver/shims. This establishes no current config-start failure from the missing peer, but is not an end-to-end bundling or native runtime proof.
2. fdir 6.5.0 has optional peer picomatch ^3 || ^4, but its resolved root picomatch is 2.3.2. tinyglobby 0.2.15 has its own nested locked picomatch 4.0.4; it constructs its matcher there and passes filters into fdir crawling, without calling fdir glob methods on this active path. `tinyglobby.globSync(['scripts/*.regression.test.cjs'])` succeeded and found 40 files. Therefore current tooling glob usage did not fail, although fdir's exposed glob APIs would resolve an unsupported declared peer.

`.npmrc` has `legacy-peer-deps=true`; the missing Metro package has no lock entry. A clean npm ci using the existing lock/settings reproduces declaration inconsistency rather than repairing it. Making npm ls fully clean requires adding the matching Metro peer and/or revising nested picomatch placement in the lock dependency graph. This can be done without upgrading existing versions, but it is a graph change and may alter native tooling resolutions. No packages were added solely to silence npm ls, no dependency manifests were falsified, and no symlink/alias workaround was applied. Treat clean dependency consistency as an outstanding pre-existing verification limitation unless root explicitly addresses the lock graph. Physical/runtime build claims should rely on native results, not the successful config/glob probes.

## Primary documentation and local version evidence

Version-specific installed source is authoritative for this audit; current online pages can differ from locked 0.13.6.

- Expo SDK 57 legacy filesystem contract: https://docs.expo.dev/versions/v57.0.0/sdk/filesystem-legacy/ . Installed `node_modules/expo-file-system/src/legacy/FileSystem.ts` confirms cancel semantics, downloadAsync resolving undefined when cancelled, and pause/resume savable data.
- Biquad API and supported filter semantics: https://docs.swmansion.com/react-native-audio-api/docs/effects/biquad-filter-node/ . Cross-checked against installed `common/cpp/audioapi/core/effects/BiquadFilterNode.cpp` rather than assuming latest docs match 0.13.6.
- Audio decoding/FFmpeg behavior: https://docs.swmansion.com/react-native-audio-api/docs/utils/decoding/ . Source/format selection does not imply all platform decoders accept every stream.
- Runtime flags (documentation explicitly NEXT, not a pinned 0.13.6 compatibility claim): https://docs.swmansion.com/react-native-audio-api/docs/next/other/runtime-flags/ . Installed package/native configuration is used for current behavior.
- youtubei.js runtime prerequisites: https://ytjs.dev/guide/getting-started . React Native support/private upstream API and IP blocking limitations: https://ytjs.dev/guide/faq . Reviewed EventTarget/CustomEvent/interpreter setup and bounded transport in the active local implementation.
- Firebase FunctionsError API: https://firebase.google.com/docs/reference/js/functions.functionserror . Installed SDK constructor confirms actual prefixed code behavior used by the regression.

Native compile, patch replay and device scenarios (screen-off, interruption, Bluetooth/wired route change, lock screen, background/foreground, Android Auto, iOS CarPlay, decoder-specific failures) remain distinct verification activities. Windows cannot prove iOS builds. Device/network availability was not invented or substituted by VM tests.

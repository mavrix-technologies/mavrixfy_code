# Application playback-flow audit

Final integration note: the parent [complete audit](../audio-engine-audit.md) supersedes intermediate counts/results. Combined final behavior checks pass409/409; strict typecheck and audio-focused lint pass. Whole-tree lint later failed on concurrent UI edits, which were preserved. No native/device scenario is inferred passed from these VM tests.

Audited on 2026-10-10 (Asia/Calcutta). This report covers application commands, hooks, state consumers, persistence, and JavaScript car integrations. Native engine and dependency/build investigations are covered by the other audit reports. The current package manifest declares Expo 57.0.27, React Native 0.86.3, React 19.2.3, Expo Audio 57.0.5, and react-native-audio-api 0.13.6. Historical TrackPlayer variable names remain, but the injected object is `StandardAudioPlayer`; no react-native-track-player package is in the manifest.

## Active flow and state ownership

UI row/screen actions and Android Auto selections call `playSong`; playlist shuffle calls `shufflePlay`. Both are provided by the one account-scoped PlayerSessionProvider. Commands reserve the selected song/queue/index synchronously, record playback intent, retire outgoing audio, resolve a playable source, and serialize native queue changes. Custom native builds use StandardAudioPlayer and the root StandardAudioRenderer; Expo Go/web use ExpoAvAdapter. URL resolution is provider-specific; source ownership and cancellation are guarded by playback request and account identity.

`PlaybackEngine` is the external presentation snapshot read by the player, rows, queue and mini player. Core React state and synchronous refs supply hook coordination and context values; they are not another physical player. `isPlaying` is the app's optimistic playback intent while loading, not proof that the decoder is currently producing audio. Decoder status/loading/buffering/errors arrive through normalized engine events. `playbackProgressStore` contains derived timeline values for independently subscribed progress UI.

Operating-system notification commands are emitted by StandardAudioPlayer's remote bindings. An installed app event handler executes the shared operation; the engine performs its fallback action only when no app handler is present. There is no duplicate Next/Pause dispatch in that binding. Remote seek currently uses the engine's seconds-based seek directly; the UI uses the shared normalized fraction-based seek command. Native focus/interruption and route-change callbacks are owned by the singleton engine, not by the UI.

## File inventory

Files below were inspected in full for the central hooks, or at their playback callbacks/imports for large presentation screens. All remain necessary unless an explicit removal is listed. This distinguishes playback-path review from claiming a full unrelated screen-layout review.

| File | Responsibility and necessity |
| --- | --- |
| `app/_layout.tsx` | Mounts the root provider once around navigation; routing does not create audio players. |
| `src/contexts/AuthContext.tsx`, `src/lib/accountScope.ts` | Account generation changes before authenticated snapshots; provides cancellation scope and account-specific storage keys. |
| `src/contexts/PlayerContext.tsx` | Selects the runtime adapter, composes playback hooks, owns account-session teardown and native renderer mounting. Root audit now keys the inner session by Firebase UID. |
| `src/contexts/PlayerContextProviders.tsx` | Context provider composition for actions, browse values, and stable row actions. |
| `src/contexts/PlayerContextDefs.ts` | Context definitions and consumer hooks; progress uses the external progress store. |
| `src/types/playbackTypes.ts` | Public playback context, quality and sleep-timer contracts. Public async action return types remain deliberately UI-oriented `void` in parts of this file; internal engine injection is now typed. |
| `src/services/audio/usePlayerCoreState.ts` | Core state/refs, shared player initialization promise, URL resolution caches, adjacent source preparation, autoplay append. Initialization uses the injected typed player. |
| `src/services/audio/audioPlaybackCommands.ts` | Play, toggle, next, previous, and seek; request cancellation, optimistic intent, source resolution, initial position, and deferred recently-played persistence. |
| `src/services/audio/audioNativeQueueLane.ts` | Serializes mutation-only operations; validates/rebuilds queues while preserving the active track and live intent. Uses `Promise<void>` rather than a generic return type that could hide cancellation. |
| `src/services/audio/audioQueueOperations.ts` | Shuffle/canonical order, repeat, queue append, Play Next, removal, drag reordering, clear queue, and persistence. |
| `src/services/audio/audioStartupReconcile.ts` | Reconnects owned native playback when available; otherwise restores a paused account-specific queue. Restoration yields to user commands and account changes. |
| `src/services/audio/audioProgressTracking.ts`, `src/services/audio/audioTimeline.ts` | Progress normalization, effective seek override, decoder vs catalog duration, Expo completion, bounded YouTube fallback recovery. Root added startup-only persisted progress restoration. |
| `src/services/audio/playbackProgressStore.ts` | Deduplicated external progress snapshot; inactive views stop subscribing, while audio event processing continues. |
| `src/services/audio/audioSyncListeners.ts` | Owns app subscriptions to normalized native events, state/track/progress reconciliation, native completion continuation, background persistence, foreground resync, and optional CarPlay requests. |
| `src/services/audio/audioPlaybackValues.ts` | Memoizes the three context values; it does not construct a player or subscribe to decoder events. |
| `src/services/audio/audioQualityControl.ts` | Persists quality preference, invalidates caches, resolves the active source, then reloads the exact native active occurrence with live position and pause intent. |
| `src/services/audio/audioSleepTimer.ts`, `src/services/audio/sleepTimerDuration.ts` | Validated duration/end-of-queue timer, single timeout owner, replacement/clear/unmount cleanup. Timer is JavaScript based. |
| `src/services/audio/audioLikedSync.ts` | One liked-store subscription per account; stable liked-row actions. |
| `src/services/audio/useAndroidAuto.ts` | Publishes bounded queue/favorites/recent catalogs and controls; routes browse and voice-search selections to shared playSong, aborts stale searches and removes listeners/catalog on unmount. |
| `src/services/carPlayService.ts` | Optional iOS native bridge facade for catalogs/Now Playing/custom favorite/shuffle/repeat events. Availability is gated by the actual native module. This audit does not claim working iOS CarPlay. |
| `src/services/player/playerPersistenceService.ts`, `src/lib/storage.ts` | Playback storage facade and account-keyed AsyncStorage snapshots/settings/recent history. Playback position is persisted on selection/track/index/background/cleanup, not every progress tick. |
| `src/lib/arrayUtils.ts` | Non-mutating Fisher-Yates shuffle and anchored queue shuffle; preserves duplicates and canonical source array. |
| `src/features/player/screens/PlayerScreen.tsx`, `src/features/player/hooks/useLegacyPlayerViewState.ts` | Player view consumes PlaybackEngine and shared actions; legacy in the hook name does not imply a legacy player. |
| `src/features/player/hooks/usePlayerLiveQueue.ts` | Derives visible queue and preserves the authoritative active duplicate index. |
| `src/features/player/hooks/usePlayerQueueCarousel.ts` | Artwork swipe maps a queue item to shared playSong; owns/clears its short gesture cooldown. |
| `src/features/player/hooks/useDevTrackHelper.ts`, `src/features/player/hooks/useArtistDiscovery.ts` | Development track selection and related-song selection enter the same command path. |
| `src/features/player/components/PlayerControlsSection.tsx`, `src/features/player/components/PlayerControlComponents.tsx`, `src/components/PlayerSlider.tsx` | Play/pause/skip/shuffle/repeat controls and scrubbing UI; slider completes with a normalized ratio. No engine creation. |
| `src/components/QueueBottomSheet.tsx`, `src/features/player/screens/QueueScreen.tsx`, `src/services/audio/queueDrag.ts` | Global queue sheet, queue route forwarding, indexed drag validation and expected queue snapshot. Queue selections call playSong against the current queue ref. |
| `src/features/player/components/QueueSleepTimer.tsx` | Timer picker and clear action; validates arbitrary whole-minute duration before applying. |
| `src/features/settings/components/ProfilePlaybackSection.tsx` | Streaming quality/autoplay/equalizer/visual preference controls; streaming quality reload enters the shared action. |
| `src/features/player/components/BackgroundYoutubeVideo.tsx` | Optional Expo Video visual backdrop: muted, volume zero, mixing enabled, no Now Playing notification, no background retention. It is not another audible music engine. |

### Traced UI entry points

| Entry point | Playback pathway |
| --- | --- |
| `src/components/SongRow.tsx` | Stable row action plays the selected song and supplied queue; active-row state comes from PlaybackEngine. |
| `src/components/AddSongsModal.tsx` | Preview/song selection calls shared playSong. |
| `src/features/home/components/HomeQuickPicks.tsx` | Selection plays the section queue. |
| `src/features/home/components/HomeYouTubeContent.tsx` | Resolves selected section item and passes its section songs. |
| `src/features/home/components/HomeRecentlyPlayed.tsx` | Recent song selection passes a one-song queue. |
| `src/features/search/hooks/useSearchEngine.ts` | Song results use current result queue; recent-history song selection uses a one-song queue. |
| `src/features/library/screens/LikedSongsScreen.tsx` | Play, shuffle and row selection use current filtered liked queue; pause/resume uses shared toggle. |
| `src/features/playlists/screens/PlaylistDetailScreen.tsx` | Playlist Play/Shuffle and rows use shared commands; repeated playlist play toggles current playback. |
| `src/features/artists/screens/ArtistDetailScreen.tsx` | Artist Play/Shuffle/release selection uses shared commands. |
| `src/features/artists/screens/ArtistMixScreen.tsx` | Mix Play/Shuffle uses shared commands. |
| `src/features/downloads/screens/DownloadedSongsScreen.tsx` | Completed-song Play/Shuffle uses shared commands and resolver/download validation. |
| `src/features/navigation/AppNavBar.tsx`, `src/features/navigation/IOSMiniBarOverlay.tsx` | Mini-player controls call shared toggle and consume engine snapshots. |
| Android Auto | Catalog ID lookup and cancellable search call shared playSong; custom actions use the shared queue/liked actions. |
| Optional CarPlay | Custom browse/play/favorite/shuffle/repeat events call shared app actions. Native iOS deployment remains separately unverified. |

## Confirmed defects and changes

| Severity | Confirmed defect and evidence | Implemented correction and regression evidence |
| --- | --- | --- |
| High | Rapid toggles were dropped by togglePlayInFlightRef; earlier resume could await setup/native reads and later play or reload after Pause/new selection. | Removed the redundant latch. Request/song/live-intent guards protect initialization, reads, queued operations and catch recovery. App-flow tests cover delayed initialization, second toggle, and new selection. |
| High | A previous end-of-queue pause could complete after a new selection and publish false playback; a delayed seek could target a newer request of the same song ID. | Recheck request identity after terminal pause and before seek/catch reconciliation. App-flow and audio-seek tests cover both overlapping transitions. |
| High | Startup native/storage reads and foreground reads could overwrite a more recent selection. Initial persisted index could disagree with currentSong. | Startup validates untouched request/account identity after every await; foreground validates song/queue/pending identity and publishes matching snapshot. Restored index identifies the stored current song. App-flow tests cover selection/account changes and mismatched persisted index. |
| High | Authentication changed storage scope while one PlayerProvider retained the previous account's queue, cached files and active audio. Old effect cleanup could write into the new account. | Root keys inner playback session by Firebase UID. This audit guards persistence, deferred selection persistence, queued mutations and delayed queue resolution with captured account identity. App-flow and queue-lane tests reject old-session writes/mutations. |
| High | Removing an upcoming JS item used its JS index against an unsynchronized native queue, potentially removing the sole playing native track. | Direct removal requires matching native/JS order; otherwise rebuild with the active position. Reject invalid/fractional indices and stale queue edits. App-flow test asserts no sole-item removal. |
| High | Cached managed local URLs bypassed resolver revalidation. A freshly resolved URL could also be ignored by the native synchronized skip fast path. | Local cache entries and local queue-build shortcuts re-enter the resolver. Fast skip now requires native target ID and URL to match the resolved URL. App-flow tests verify revalidation and old-native-URL rejection. Root adds selection-time managed-file validation for automatic native advancement. |
| Medium | shufflePlay's canonical source was overwritten by playSong's new shuffled queue, and its delayed completion could overwrite later source state. | Restore canonical source immediately after the synchronous play reservation and before awaiting playback. App-flow test verifies shuffle-off restores original order. |
| Medium | toggleRepeat changed core/context state but did not publish PlaybackEngine.repeatMode, which player/queue UI reads. | Publish the repeat snapshot in the same synchronous action. App-flow test checks the UI-facing value. |
| Medium | Duplicate song IDs selected/advanced/reloaded the first occurrence rather than the active occurrence. | Selection prefers queue object identity; normalized native track events and quality reload use valid native active index; live queue and shuffle use the current occurrence. App-flow and quality tests cover repeated IDs. |
| Medium | Native progress listener overwrote positionSecondsRef with raw position after the progress hook had applied the effective seek override. | Removed the competing write; progress hook owns effective position. App-flow test confirms a stale decoder tick does not erase the seek target. |
| Medium | Native error paths could leave playbackLoadingRef true and snapshot desiredPlayState/error inconsistent with paused refs; timer queue completion left resume intent true. | Clear loading and publish desired=false and actionable error at terminal failures; end-of-queue timer clears resume intent. App-flow tests assert error/intent/loading agreement. |

Removed proven obsolete compatibility branches for players lacking setQueue/load/seek, and redundant initial-position seeks after setQueue/load. One-item load fallback remains for incomplete bulk queues. Hook player injection now uses `NativePlaybackPlayer | null` and typed state/event/repeat constants. Dynamic native event payloads and some catalog/storage boundaries still contain `any`; this is not a claim that the whole audio tree is fully typed.

## Event/listener and cleanup ownership

- StandardAudioPlayer owns SDK notification and system focus/interruption/route listeners once per singleton setup. Its remote-command fallback only executes when no app listener owns that command.
- audioSyncListeners owns app native subscriptions and removes every returned subscription on effect cleanup. Repeat/autoplay identity changes still reinstall this effect; that is a remaining simplification opportunity, not evidence of duplicate listeners.
- audioProgressTracking owns the Expo adapter status subscription and unsubscribes on cleanup. Outgoing adapter generations suppress stale source events.
- audioSyncListeners owns one background persistence AppState subscription and one foreground reconciliation subscription; these do different jobs and both remove subscriptions. Persistence cleanup is account guarded.
- useAndroidAuto owns three bridge subscriptions, one current search AbortController and catalog cleanup. CarPlay owns its optional bridge subscriptions through the facade and removes them on effect cleanup.
- audioSleepTimer owns one timeout, clears it on replacement, explicit clear and unmount. The carousel owns its separate short UI cooldown timeout and clears it on unmount.
- PlayerSessionProvider teardown invalidates pending play requests, clears desired play intent, resets native engine, destroys Expo audio and resets the external snapshot. Renderer graph disposal remains the native renderer's responsibility.

## Verification completed

`npm run typecheck` passed after internal player typing and queue scope changes. Targeted ESLint passed (exit 0, no diagnostics) for changed application hook/context-adjacent files and new/updated tests.

This command passed 77/77 before the final additional terminal-error/expired-native-URL cases were added:

```powershell
node --test scripts/audio-app-flow.regression.test.cjs scripts/audio-transition.regression.test.cjs scripts/audio-progress.regression.test.cjs scripts/audio-seek.regression.test.cjs scripts/queue-mutation.regression.test.cjs scripts/queue-reorder.regression.test.cjs scripts/quality-change.regression.test.cjs scripts/sleep-timer.regression.test.cjs scripts/expo-playlist-flow.regression.test.cjs scripts/streaming-quality.regression.test.cjs
```

After those additions, `node --test scripts/audio-app-flow.regression.test.cjs scripts/queue-mutation.regression.test.cjs` passed 25/25. After adding final end-of-queue/seek identity coverage, `node --test scripts/audio-app-flow.regression.test.cjs scripts/audio-seek.regression.test.cjs` passed 26/26. The app-flow file now has 22 behavioral cases, the quality file has a new duplicate-occurrence case, the queue-mutation file has two new account-cancellation cases, and audio-seek has a new same-song request case. These tests transpile and execute real hooks against controlled React/native/network boundaries; they do not prove native decoder or operating-system behavior. Root final checks supersede these intermediate counts.

## Documentation checked and practical limits

- [React Native 0.86 AppState](https://reactnative.dev/docs/0.86/appstate): foreground/background events and subscription API match the actual installed RN version. Reconciliation and persistence use those events and clean up their subscriptions. The two async reads still require application identity checks; the framework does not cancel them for the application.
- [React Native 0.86 timers](https://reactnative.dev/docs/0.86/timers): the duration sleep timer uses RN's JavaScript timeout facilities. This document does not promise process-independent/exact background execution. Exact expiry under suspension, power restrictions, process death and manufacturer policies remains a native/device validation requirement.
- [React useEffect](https://react.dev/reference/react/useEffect): official current API explains cleanup with old effect values, async response cancellation and the development setup/cleanup probe. These stable lifecycle rules motivate account-guarded cleanup and stale-result rejection. The current site displays React 19.3, while this app installs 19.2.3; no newer API was introduced from that documentation.

No physical playback, Android Auto, iOS Control Center, native iOS CarPlay, Bluetooth/call/focus device scenario, background deadline, or native build was performed by this application-flow subtask. Other audit work may execute available Android build/device checks; consult final root results.

Remaining limits: persistence does not retain canonical pre-shuffle order, shuffle/repeat flags, user-queue/autoplay classifications or exact paused-session native graph state; process relaunch therefore restores a paused queue with default repeat/shuffle. Duplicate IDs are preserved for selection/advance/reload/reordering, but add-to-queue deliberately rejects an already queued ID and source removal still uses ID-level membership semantics. Repeating the exact same Song object twice cannot identify a selected occurrence through an ID/object-only public playSong API; native index-based automatic transitions remain identifiable. Catalog stream caches have no independent HTTP expiration refresh policy; YouTube refresh/retry is bounded and provider-specific. SDK/native errors still need real stream/device validation. No speculative timer service, competing focus handler, second notification layer or alternate music player was introduced.

# StandBy stability and rotation audit

Reviewed and implemented on 10–11 October 2026. Scope: the StandBy hook and overlay, native orientation policy, player sheet callbacks, portrait player dependencies, fullscreen lyrics, global sheets, playback progress, accessibility, and foreground lifecycle. Existing unrelated working-tree changes were preserved.

The expanded player now has an explicit StandBy button immediately left of the top song-options button. Tapping it opens StandBy and requests landscape; rotating alone never activates it. Close/Back returns to the expanded portrait player. Current window dimensions control layout only. Playback remains owned by the existing audio engine. This is code and bundle validation, not certification of native rendering on every device.

## Problems fixed

### Orientation and lifecycle

- An awaited landscape request could outlive player cleanup and override portrait restoration. Native requests now run in sequence, and superseded queued requests are skipped. A stale failed opening cannot apply a fallback after dismissal.
- The orientation listener could be installed after cleanup, leaking its subscription. It is no longer needed: actual window dimensions determine which layout can fit. This also removes conflicting sensor-versus-dimensions state and extra orientation queries.
- iOS and Android explicitly request `LANDSCAPE` on manual entry, allowing both landscape directions. The sensor-driven `ALL`/`DEFAULT` policies and fallback are removed. A rejected lock does not hide controls: StandBy adapts to the actual window. [Expo ScreenOrientation](https://docs.expo.dev/versions/latest/sdk/screen-orientation/)
- Closing, backgrounding, and unmounting restore portrait on platforms that permit it. Only an explicitly opened StandBy session in the foreground requests landscape. Closing the full player clears that session; reopening does not reactivate it.
- Native startup orientation is explicit through the official config plugin. Config introspection confirmed `UIInterfaceOrientationMaskPortrait`, all four iPad orientations, and `UIRequiresFullScreen=false`.
- Delayed preference reads cannot overwrite a newer style choice. Writes are ordered, remounts wait for pending writes, and rejected storage/haptic operations are handled. The historical boolean preference migrates to Classic/Night; Ambient is saved under the same key.
- Inactivity timers stop on exit/background/unmount. Old callbacks cannot dim newly awakened controls. Re-entry resets dimming before paint.

### Player integration

- StandBy replaces the portrait bottom sheet entirely. No empty sheet or its gesture surface remains underneath. Portrait video, lyric views, artist discovery, ads, carousel work, and their subscriptions unmount together. The global audio renderer remains mounted.
- StandBy entry closes the existing queue and add-songs sheets, which otherwise appear above the player.
- The fullscreen lyrics modal permits portrait and both landscapes. Its previous iPhone portrait default could prevent the rotation that activates StandBy. The progress wrapper is now mounted only while lyrics are actually visible. [React Native Modal](https://reactnative.dev/docs/modal)
- Rotation-generated close callbacks do not collapse an expanded landscape player. Explicit Back/exit dismissal still releases retained content. Store revisions reject obsolete close and opening callbacks after rapid reopening.
- Returning to portrait reasserts the native sheet's expanded index. A previously settled player remounts without repeating its opening animation after foreground restoration.
- Portrait layout uses current dimensions and safe-area insets. Removed the dimension-swapping and maximum-ever-inset workarounds, plus the unused `playerModalRef` store and its effect.
- A scoped Expo keep-awake component prevents display sleep only during active StandBy. Its unique hook tag and unmount cleanup release that request on exit/background. The already installed SDK-compatible package is now a direct dependency. [Expo KeepAwake](https://docs.expo.dev/versions/latest/sdk/keep-awake/)

### Rendering, layout, and controls

- The overlay uses one fixed 20 dp outer spacing value in addition to mirrored safe-area insets, one 24 dp column gap, 12 dp transport spacing and a 16 dp metadata gap. Dynamic centering margins, compact spacing overrides, the nested artwork container, artwork borders, button padding, redundant width overrides and negative timestamp margins are removed. Shuffle/Repeat and Queue/Lyrics use matching 48 dp edge slots: Queue aligns directly under Shuffle, Lyrics under Repeat, and Save shares the same right-edge center. The three middle playback slots flex to fill the remaining width with a shared 56 dp height. Normal layouts have no horizontal scrolling containers. Below 248 dp of available width, one horizontal container keeps both button rows usable. Seek, playback and volume controls are pinned below the independently scrollable clock/title area on normal landscape windows. They cannot scroll out with metadata. Below 220 dp of usable height or above 1.4 font scale, the full pane scrolls so all controls remain reachable when they cannot fit simultaneously. Classic/Night dim opacity is 55% instead of 22%, preserving legibility.
- Every action has an accessibility role and label, 48 dp or larger targets, and an explicit exit action. Keyboard and screen-reader button activations also reset inactivity. Seeking resets it throughout a scrub.
- Progress ticks render only the slider and timestamps. They do not rerender artwork or the clock, and the progress subscription is removed while inactive.
- The clock uses 12-hour time with AM/PM, including midnight/noon. It updates at minute boundaries and stops its timer while hidden/backgrounded. It refreshes immediately on activation.
- Seeking uses the full fractional duration rather than a rounded-down denominator. Unknown duration disables seeking and uses a valid text-only accessibility value.
- Removed oversized forced-landscape dimensions, glow/shadow work, redundant activation haptics, morph interpolations, retained exit state, and all overlay/pane opacity animations. Controls render immediately with no zero-opacity transition state; inactive overlays return null.
- Title/artwork/video motion follows the live Reduce Motion setting. The title stops scrolling while dimmed or inactive. Classic/Night dimming uses a direct bounded opacity; the right pane itself never fades out. [AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo), [useWindowDimensions](https://reactnative.dev/docs/usewindowdimensions)

### Three styles and inline queue/lyrics

- The existing small night button cycles **Classic → Night → Ambient → Classic**. There is no separate style-picker row. All three styles use the same artwork size, control positions and action row; style changes cannot rearrange the player.
- Ambient changes the full-screen backdrop to artwork colors and a softly blurred cover. It has no enclosing foreground box. Missing artwork falls back to a color gradient. It bypasses inactivity dimming; Classic and Night retain the five-second dimming timer.
- Optional moving video respects the existing ambient-video setting, data-saver quality and device profile. Reduce Motion disables it. Classic/Night and a hidden StandBy never mount this decoder. A transparent video fallback keeps the artwork gradient visible while resolving a stream; landscape video uses no portrait overscan. [Expo Image](https://docs.expo.dev/versions/latest/sdk/image/), [Expo LinearGradient](https://docs.expo.dev/versions/latest/sdk/linear-gradient/)
- Save is a single heart button beside the title and artist, with shared like state and a 48 dp target. Queue and Lyrics form a compact horizontal icon-and-label footer at matching left/right edges. Their icons remain aligned under Shuffle and Repeat. More and its component, props, imports and nested-view state are removed from StandBy. Play/pause uses a 28 dp icon and skip buttons use 36 dp icons within the existing aligned targets. All three styles retain the same geometry. Queue and Lyrics replace the controls in the same right half while artwork stays fixed in the left half. Back restores controls; Android hardware Back and accessibility escape also return to controls before exiting StandBy. Switching content renders immediately without hiding the right pane.
- The two columns share equal width and fill the height inside the safe areas. Artwork fills its column using cover scaling; a wide or tall column can crop the cover. Artwork and the controls viewport share top/bottom edges; the header, title, slider, icon rows and detail views share the same right-column bounds. There is no third column or lower detail panel. Very narrow windows give controls or the selected view the full available width.
- Queue retains every upcoming song, virtualizes its rows, and plays through the existing engine with the original queue. Row metrics scale with the system font size. [React Native FlatList](https://reactnative.dev/docs/flatlist), [FlatList configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration)
- Lyrics load only when the lyrics panel is selected, using the existing cached/deduplicated lyrics service. The parent header shows the sole Lyrics title; there is no extra heading or Follow control. Text uses 28 dp bold type with a 38 dp line height and font-scaled row metrics. Synced lines follow playback; tapping a line seeks using the latest fractional engine duration. Manual dragging and momentum suspend following, which resumes on the next active-line change after scrolling ends. Unsynced lyrics disable seeking. The inline list subscribes to active-line changes rather than rerendering on every tick, and unmount removes its subscription. Long visual lines are limited to three lines per row; their complete text remains available to accessibility.

## Validation completed

- TypeScript: `npm run typecheck` passes.
- Focused ESLint: changed player hooks, overlay/layout, screen, and fullscreen lyrics pass.
- Regression suite: **460 tests pass**, including lifecycle, style migration, symmetric spacing, consistent split layout, title-row Save, inline queue/lyrics, horizontal volume stepping/scrubbing, native/Expo volume continuity, pinned transport with landscape safe-area cutouts, short-window/large-text scroll fallback, Back behavior, clock, animation, and sheet checks. The regression log is at `outputs/standby-regressions.log`.
- Production Android Metro/Hermes export passes, including all application modules. Output: `outputs/standby-android-export`.
- Production iOS Metro/Hermes export also passes. Output: `outputs/standby-ios-export`. This validates the JavaScript bundle, not an IPA or native iOS build.
- Manual entry and stable control visibility are validated by 460 regression tests, TypeScript and focused ESLint. Tests include repeated portrait/landscape resizing in all three styles, Queue/Back transitions and header button wiring.
- Expo native configuration introspection passes and confirms the startup/iPad policy above.
- `git diff --check` passes.

The tests simulate JavaScript hooks, external stores, animation callbacks, and element-tree wiring. They prove ordering, cleanup, and branching behavior. They do not prove native display rotation, modal dismissal timing, measured frame rate, battery use, or wake-lock behavior. Profile a release build because development overhead changes performance. [React Native performance](https://reactnative.dev/docs/performance)

### Playback follow-up (October 11)

Native active-track notifications now reconcile the selected song and queue occurrence without loading the same source again, forcing play intent, or setting an extra loading flag. That extra flag could make a subsequent resume return before calling the native player. Regressions verify that paused track reconciliation still permits resume, native advancement does not reload its source, and late queue-ended events do not advance a paused queue. StandBy also omits the unused portrait bottom sheet in landscape while the global audio renderer stays mounted. Native listening tests remain required to confirm the reported silence on the user's device.

Follow-up validation: all 458 regression tests, TypeScript, focused ESLint, and Android/iOS production exports pass. Bundles are at `outputs/standby-playback-export`.

Manual-entry follow-up: all 460 regression tests, TypeScript and focused ESLint pass. Android/iOS production exports pass at `outputs/standby-manual-export`. The new 48 dp header control opens StandBy independently of physical rotation; Close/Back preserves the expanded player. Repeated resize tests verify reachable playback actions across all three styles. Physical-device rendering remains unverified in this workspace.

## Native release acceptance checks

No Android device/emulator is connected, and this Windows workspace cannot produce a native iOS build locally. Build fresh native binaries for the new startup config; a JavaScript update cannot apply a config-plugin change. [Expo ScreenOrientation configuration](https://docs.expo.dev/versions/latest/sdk/screen-orientation/)

1. On a notched iPhone and a compact Android phone, open StandBy with its header button, rotate between landscape directions, and return with Close/Back at least 20 times. Repeat during opening, closing, skipping tracks, seeking, and pressing Back/Exit. There must be no stuck black sheet, stale overlay, clipped controls, or playback restart.
2. Confirm rotation alone never enters StandBy. Open StandBy from the full-player header after dismissing fullscreen lyrics, queue or add-songs, and check native dismissal causes no visible jump or crash. Repeat while a song-options native sheet is presented; native presentation ordering needs device verification.
3. Background/foreground, lock/unlock, open Control Center/notifications, and interrupt playback with another app. Check audio continuity, current clock/progress, dimming reset, and correct display-sleep release.
4. Test Android gesture navigation and three-button navigation, both notch sides, system rotation lock on/off, font scale up to the device maximum, Reduce Motion, VoiceOver/TalkBack, and hardware keyboard actions.
5. Test an Android 16 tablet, a foldable inner/outer display, and resized multi-window layouts. Target API 36 is already configured; the OS can ignore portrait restrictions on displays with smallest width at least 600 dp. StandBy therefore follows the window even if a lock is ignored. [Android adaptive orientation guidance](https://developer.android.com/develop/adaptive-apps/guides/app-orientation-aspect-ratio-resizability)
6. Test iPad multitasking and window resizing. The app preserves existing multitasking support; Expo describes restrictions on orientation locking in this mode. The button selects StandBy; window shape determines how its controls fit. [Expo iPad orientation guidance](https://docs.expo.dev/versions/latest/sdk/screen-orientation/)
7. Measure frame pacing, main/JS thread load, memory, decoder count, thermal behavior, and screen-on battery usage during a sustained release-build session. Capture results on at least one low-end Android device and one iPhone before claiming performance or battery improvements.
8. Cycle all three styles while playing, paused, dimmed, and viewing queue/lyrics. Geometry and icon alignment must stay fixed with mirrored safe-area padding. Confirm Ambient never dims; artwork/video fallback stays colored, settings and Reduce Motion disable video correctly, inline queue selection preserves the queue, and larger lyric text, seeking and following survive skipping tracks and resizing. Verify each Back action, title-row Save and horizontal volume control on both platforms. Listen for correct mute/volume through track changes, interruptions and EQ presets; separately check the device's hardware volume buttons.

## Product behavior to decide before long-duration use

- Entering StandBy discards portrait scroll position and fullscreen lyric state. Playback and queue remain in their existing shared engine. Returning to portrait rebuilds the display from the current track.
- The explicit StandBy button requests native landscape and can override system rotation lock. No sensor-driven activation remains. The window can still be resized independently on platforms that ignore locks.
- Night mode changes colors and control opacity. It does not change hardware brightness, guarantee pure monochrome artwork, or provide burn-in protection. Charging-only activation, pixel shifting, a session timeout, or a screen-off option need a deliberate policy if all-night use is intended.
- The underlying application remains responsible for adaptive layouts outside the player when a tablet OS ignores portrait restrictions. This audit does not certify every unrelated application screen for all window sizes.

### StandBy cleanup

Removed the volume row, buttons, slider, overlay props, screen bindings and unused volume styles. Queue/Lyrics use a single 48 dp horizontal row with inward-facing labels and matching 20 dp icons. Playback retains its larger central play control. Metadata and transport spacing give each section more room while preserving the safe-area split and scroll fallback. Current validation: 459 regression tests, TypeScript and focused ESLint pass. The latest production export above predates this layout-only cleanup.

### Portrait restoration follow-up

The reported screenshot shows Home above a partially positioned player after exiting StandBy. The portrait sheet previously mounted with inferred geometry while native rotation was still changing the window, and an imperative snap effect competed with its controlled index. PlayerScreen now supplies the installed bottom-sheet library's `containerLayoutState` API with current window height and measured root-container height. Native container-resize handling can recalculate its full-height snap point directly. The redundant sheet ref and imperative snap/close effect are removed; the index prop owns opening/closing.

StandBy and foreground transitions also have a presentation revision independent of the global player-store revision. Old animation, opening and closing callbacks cannot modify the restored player. Restoration starts at the expanded snap point without replaying the first-open slide, while a fresh user opening retains its normal animation. Removed the redundant StandBy ref once callback ownership covered those transitions.

Regressions cover initial opening, user swipe-close/reopening, late callbacks after a StandBy round trip, background/foreground with unchanged player-store state, exiting before initial opening settles, twenty rapid round trips, and measured/window container-height changes. All 462 regression tests, TypeScript and focused ESLint pass. These are JavaScript lifecycle/element-tree checks, not native animation or screenshot verification. ADB reports no connected devices; native iPhone testing is unavailable on this Windows host.

Physical release checks still required: repeat entry/exit in both landscape directions while playing and paused; use Close, accessibility escape and Android Back; exit from Queue/Lyrics; background or lock during rotation; rapidly reopen/collapse; and repeat with Reduce Motion, larger text and safe-area cutouts. Confirm the player returns to full height, Home stays covered after restoration, artwork/title/controls match the active song, scrolling/swipe-close work, and audio continues without restart.

Android/iOS production exports also pass at `outputs/standby-restoration-export`. They validate the production JavaScript/Hermes bundles, including the volume cleanup, without certifying native rendering.

Latest alignment refinement: Queue and Lyrics both place their labels below the icon, using the same shared 48 dp edge slots as Shuffle/Repeat, header actions and Save. Removed metadata stretching between clock and song information; those elements use a single 12 dp gap and retain the common outer safe-area padding. Header items align vertically in the same row. TypeScript, focused ESLint and all 62 player/StandBy checks pass. The production export above predates this style-only refinement.

### StandBy visual redesign

All three styles now use one Ionicons family, including shuffle, repeat, previous/next, play/pause, Queue/Lyrics, Save, style and Close. Repeat-one has a small numeral badge and retains its explicit accessibility label. The installed icon font is already preloaded by the app. Ionicons is the official open-source pack from Ionic; no new dependency or app-wide icon migration was introduced. [Ionicons](https://ionic.io/ionicons)

The left column now centers a square artwork surface bounded by both column width and available height. `contentFit="contain"` preserves the cover instead of cropping it to a wide rectangle. Song typography is more prominent, the clock is quieter, header bubble backgrounds are removed, and queue artwork/text are larger. Full-size transport uses a 64 dp play target and consistent 30 dp skip/play symbols; compact layouts use a 56 dp play target with reduced vertical gaps. Queue/Lyrics retain their aligned 48 dp edge slots. Metadata scrolls independently of the pinned playback area, and the previous rotation/restoration protections remain.

Validation: the complete 462-test suite passed before the final compact-spacing adjustment; all 62 player/StandBy checks pass afterward, along with focused ESLint. Native appearance still requires physical-device verification.

Final TypeScript checking and Android/iOS production exports also pass. Current redesign bundles are at `outputs/standby-redesign-export`.

### Responsive spacing and clipping follow-up

Artwork now occupies only its fitted square width; controls, Queue and Lyrics receive the remaining horizontal space. Balanced left/right margins include the larger horizontal cutout inset. Top and bottom use their own safe-area insets, avoiding duplicated home-indicator padding. Outer spacing reduces to 12 dp on short windows and uses 16 dp otherwise; the column gap reduces to 16 dp on narrow content.

Windows with less than 300 dp of usable height scroll the full pane so metadata cannot be squeezed into a clipped strip above transport. Larger windows retain pinned transport; enlarged text retains its full-pane scrolling fallback. Regression assertions cover square bounds, total allocated width/height, asymmetric insets, remaining controls width, narrow/portrait fallback and short-screen scrolling.

Validation: all 462 regression tests, TypeScript and focused ESLint pass. This is layout calculation and element-tree verification; physical-device rendering remains unverified. The prior production export predates this spacing adjustment.

### Shared Next/resume stability follow-up

Confirmed both portrait and StandBy actions use the same audio command hook and the globally mounted native renderer. Fixed a queue-lane stall: StandardAudioPlayer previously awaited native-side YouTube resolution/download validation without cancellation or a deadline. A replaced selection now releases those waits immediately; reset also releases them, late results remain guarded by selectionVersion, and current waits fail after 27 seconds with a recoverable loading timeout. This supplements the existing initial URL-resolution deadline, which did not cover resolution inside native queue selection.

Play/Pause now toggles desired user intent, falling back to reported state only when no intent exists. Its loading shortcut requires a pending request matching the current request ID, so a leftover loading flag cannot suppress a native resume. Removed the obsolete loading-ref dependency from that callback. Retained the official Audio onLoad ownership of initial graph attachment/play and AudioTagHandle.play for resume; no new audio owner, dependency, retry loop, or StandBy-specific playback logic was introduced.

Official references checked against the installed 0.13.6 package: [Audio tag](https://docs.swmansion.com/react-native-audio-api/docs/next/sources/audio-tag/) and [AudioContext](https://docs.swmansion.com/react-native-audio-api/docs/core/audio-context/). Cancellation and selection deadlines are application-level coordination, not a library-prescribed recipe.

Added regressions for Android/iOS queue-lane replacement while stream resolution hangs, late old-stream completion, subsequent pause/resume, native resolution timeout, reset during hung local validation, stale loading flags, lagging reported play state, and Pause with/without Play during Next loading. All 470 regression tests, TypeScript and focused ESLint pass. Android/iOS production exports pass at outputs/standby-audio-stability-export. These tests simulate command ordering and native callbacks; audible output and OS interruptions still require physical-device verification.

### Title/progress inset, round controls and battery follow-up

StandBy title/artist and progress share an 8 dp horizontal inset. This leaves room for the slider's 10 dp thumb and its pressed scale at both endpoints instead of cutting its outer half at the parent's boundary. Title uses explicit 26/34 dp type/line-height (22/30 compact), artist uses 14/20, and both wrap to two lines. Removed StandBy's marquee branch and unused foreground subscription; longer metadata retains the existing scroll area.

Restored identical circular 48 dp style/Close buttons with a subtle translucent background. Added battery percentage and charging indication beside the date using official expo-battery ~57.0.3 hooks. Unknown/invalid battery levels are hidden, and the battery component unmounts while StandBy/foreground is inactive. Narrow clock areas wrap the date/battery row rather than cropping it.

Reference: [Expo Battery](https://docs.expo.dev/versions/latest/sdk/battery/). This adds a native module, so an existing development or release binary must be rebuilt before using this change. A JavaScript-only update cannot add ExpoBattery to an older binary.

Validation: TypeScript, focused ESLint and all 472 regression tests pass. Added checks for shared text/slider inset, thumb clearance, round header controls, battery percentage, charging, unknown levels and background hiding. Native rendering remains unverified on a physical device.

Android/iOS production exports pass at outputs/standby-battery-export. These validate bundling, not native battery module integration in an existing binary.

### Connected Android verification — 2026-10-11

Built and installed the arm64 debug app on the connected vivo 1901 without clearing app data. The previous binary lacked ExpoBattery; rebuilding linked BatteryModule successfully. Battery percentage now renders on the phone. A fresh USB-connected development session on port 8082 showed no missing-battery-module error or render-time Reanimated shared-value warning. The existing port 8081 server was preserved.

Real rendering exposed stale portrait window dimensions after entering landscape: artwork disappeared and metadata was clipped above the transport. StandBy now measures its actual native viewport with onLayout inside native SafeAreaView padding. Android navigation/cutout space is reserved before calculating artwork and controls. Compact geometry applies below 380 dp usable height; compact Queue/Lyrics use a shorter icon slot while retaining 48 dp touch targets. A regression reproduces portrait dimensions with a landscape native measurement, including transient zero measurements.

A second physical-device failure left the portrait sheet off-screen while the player store still said expanded. Removed the custom shared container-height/window-height synchronization and let BottomSheetHostingContainer measure its own native container. Presentation changes reset interaction readiness so remounted sheets complete their native opening before enabling expensive content. Existing revision guards still reject outgoing sheet callbacks. Repeated StandBy entry/Close restored the full portrait player after these changes, including a round trip without intervening source edits. Screenshots: outputs/phone-final-standby.png and outputs/phone-final-exit.png. Development refresh and system rotation can expose intermediate frames; these screenshots verify settled layout, not measured transition frame times.

Patched @gorhom/bottom-sheet 5.2.14 useReactiveSharedValue to synchronize changed input in useLayoutEffect rather than writing a shared value during render, and update the remembered input to avoid repeated writes. The persisted patch covers TypeScript and both built distributions; an executable regression checks write timing and unchanged shared-value identity. No warning suppression was added.

Device playback evidence: Next changed metadata from Jaan Se Guzarte Hain to Dil Lagana Mana Tha and the Android media session reached playing state with advancing position. Pause changed the session to paused, holding around 29 seconds; Play resumed to playing and advanced beyond 31 seconds. This verifies native state and progress, not independently heard audio, every stream source, Bluetooth, OS interruptions or iOS. Lyrics opened inline with a Back control and loading state; fetched lyric rendering was not fully verified. The catalog-home search-fallback warning remains unrelated to StandBy.

Final validation: 474 regression tests, TypeScript, focused ESLint and Android production export pass. Export: outputs/phone-standby-export. Native build log: outputs/phone-debug-build.log. No generated native source was manually edited.

Official layout references: [SafeAreaView](https://appandflow.github.io/react-native-safe-area-context/api/safe-area-view/) and [React Native onLayout](https://reactnative.dev/docs/view#onlayout). Native safe-area padding plus measurement is application layout coordination using these existing APIs.

# Native Doctor — Project Health Report

> **Health Score**: **98/100 [ EXCELLENT ]** | Technical Debt: **LOW**

## Project Overview

- **Target Path**: `E:\Mavrixfy\Mavrixfy_App`
- **Architecture Workflow**: `expo-bare-or-prebuilt`
- **Scanner Version**: `v0.1.0`
- **Scan Scope**: 219 relevant files (217 code files, 2 native files)
- **Execution Timing**: file scan 594ms | static analysis 1665ms | rules run: 29

## Summary of Findings

| Severity | Count | Description |
| :--- | :---: | :--- |
| **Errors** | **0** | Action required; potential build failure, crash, or breaking misconfiguration |
| **Warnings** | **0** | Review and fix before release; architecture, performance, or native defect |
| **Suggestions** | **11** | Best-practice recommendations and modernization improvements |
| **Reviews** | **1** | Heuristic observation requiring developer investigation |

## Category Health Scores

| Category | Score | Status |
| :--- | :---: | :--- |
| **ui** | **100/100** | Optimal |
| **accessibility** | **100/100** | Optimal |
| **code** | **78/100** | Good |
| **correctness** | **100/100** | Optimal |
| **performance** | **100/100** | Optimal |
| **architecture** | **99/100** | Optimal |
| **native** | **100/100** | Optimal |
| **security** | **100/100** | Optimal |
| **dependencies** | **100/100** | Optimal |
| **config** | **100/100** | Optimal |

---

## Detailed Findings

### [SUGGESTION] RNDOCTOR-PLATFORM-010 — Heavy Platform.OS branching in shared code

- **Category**: `code`
- **Confidence**: `MEDIUM`
- **Location**: `app/(tabs)/_layout.tsx:30`

**What was found:**
> Found 3 inline Platform.OS comparisons in a single shared file.

**Why it matters:**
> Heavy inline platform branching makes shared code harder to read and test, and often duplicates logic that platform-specific files would handle more cleanly.

**Official platform guidance:**
> React Native resolves .ios.js/.android.js file extensions automatically at build time for platform-specific implementations.

**Recommended fix:**
> Consider extracting the platform-specific branches into app/(tabs)/_layout.ios.tsx and app/(tabs)/_layout.android.tsx.

**Documentation:**
- [https://reactnative.dev/docs/platform-specific-code](https://reactnative.dev/docs/platform-specific-code)


### [SUGGESTION] RNDOCTOR-PLATFORM-010 — Heavy Platform.OS branching in shared code

- **Category**: `code`
- **Confidence**: `MEDIUM`
- **Location**: `src/components/KaraokeLyricsView.tsx:811`

**What was found:**
> Found 3 inline Platform.OS comparisons in a single shared file.

**Why it matters:**
> Heavy inline platform branching makes shared code harder to read and test, and often duplicates logic that platform-specific files would handle more cleanly.

**Official platform guidance:**
> React Native resolves .ios.js/.android.js file extensions automatically at build time for platform-specific implementations.

**Recommended fix:**
> Consider extracting the platform-specific branches into src/components/KaraokeLyricsView.ios.tsx and src/components/KaraokeLyricsView.android.tsx.

**Documentation:**
- [https://reactnative.dev/docs/platform-specific-code](https://reactnative.dev/docs/platform-specific-code)


### [SUGGESTION] RNDOCTOR-PLATFORM-010 — Heavy Platform.OS branching in shared code

- **Category**: `code`
- **Confidence**: `MEDIUM`
- **Location**: `src/contexts/AuthContext.tsx:251`

**What was found:**
> Found 3 inline Platform.OS comparisons in a single shared file.

**Why it matters:**
> Heavy inline platform branching makes shared code harder to read and test, and often duplicates logic that platform-specific files would handle more cleanly.

**Official platform guidance:**
> React Native resolves .ios.js/.android.js file extensions automatically at build time for platform-specific implementations.

**Recommended fix:**
> Consider extracting the platform-specific branches into src/contexts/AuthContext.ios.tsx and src/contexts/AuthContext.android.tsx.

**Documentation:**
- [https://reactnative.dev/docs/platform-specific-code](https://reactnative.dev/docs/platform-specific-code)


### [SUGGESTION] RNDOCTOR-PLATFORM-010 — Heavy Platform.OS branching in shared code

- **Category**: `code`
- **Confidence**: `MEDIUM`
- **Location**: `src/services/notificationService.ts:51`

**What was found:**
> Found 3 inline Platform.OS comparisons in a single shared file.

**Why it matters:**
> Heavy inline platform branching makes shared code harder to read and test, and often duplicates logic that platform-specific files would handle more cleanly.

**Official platform guidance:**
> React Native resolves .ios.js/.android.js file extensions automatically at build time for platform-specific implementations.

**Recommended fix:**
> Consider extracting the platform-specific branches into src/services/notificationService.ios.ts and src/services/notificationService.android.ts.

**Documentation:**
- [https://reactnative.dev/docs/platform-specific-code](https://reactnative.dev/docs/platform-specific-code)


### [SUGGESTION] RNDOCTOR-PLATFORM-010 — Heavy Platform.OS branching in shared code

- **Category**: `code`
- **Confidence**: `MEDIUM`
- **Location**: `src/lib/downloads/deviceInfo.ts:62`

**What was found:**
> Found 4 inline Platform.OS comparisons in a single shared file.

**Why it matters:**
> Heavy inline platform branching makes shared code harder to read and test, and often duplicates logic that platform-specific files would handle more cleanly.

**Official platform guidance:**
> React Native resolves .ios.js/.android.js file extensions automatically at build time for platform-specific implementations.

**Recommended fix:**
> Consider extracting the platform-specific branches into src/lib/downloads/deviceInfo.ios.ts and src/lib/downloads/deviceInfo.android.ts.

**Documentation:**
- [https://reactnative.dev/docs/platform-specific-code](https://reactnative.dev/docs/platform-specific-code)


### [SUGGESTION] RNDOCTOR-PLATFORM-010 — Heavy Platform.OS branching in shared code

- **Category**: `code`
- **Confidence**: `MEDIUM`
- **Location**: `src/features/authentication/screens/LoginScreen.tsx:319`

**What was found:**
> Found 10 inline Platform.OS comparisons in a single shared file.

**Why it matters:**
> Heavy inline platform branching makes shared code harder to read and test, and often duplicates logic that platform-specific files would handle more cleanly.

**Official platform guidance:**
> React Native resolves .ios.js/.android.js file extensions automatically at build time for platform-specific implementations.

**Recommended fix:**
> Consider extracting the platform-specific branches into src/features/authentication/screens/LoginScreen.ios.tsx and src/features/authentication/screens/LoginScreen.android.tsx.

**Documentation:**
- [https://reactnative.dev/docs/platform-specific-code](https://reactnative.dev/docs/platform-specific-code)


### [SUGGESTION] RNDOCTOR-PLATFORM-010 — Heavy Platform.OS branching in shared code

- **Category**: `code`
- **Confidence**: `MEDIUM`
- **Location**: `src/features/library/screens/ImportSongsScreen.tsx:56`

**What was found:**
> Found 5 inline Platform.OS comparisons in a single shared file.

**Why it matters:**
> Heavy inline platform branching makes shared code harder to read and test, and often duplicates logic that platform-specific files would handle more cleanly.

**Official platform guidance:**
> React Native resolves .ios.js/.android.js file extensions automatically at build time for platform-specific implementations.

**Recommended fix:**
> Consider extracting the platform-specific branches into src/features/library/screens/ImportSongsScreen.ios.tsx and src/features/library/screens/ImportSongsScreen.android.tsx.

**Documentation:**
- [https://reactnative.dev/docs/platform-specific-code](https://reactnative.dev/docs/platform-specific-code)


### [SUGGESTION] RNDOCTOR-PLATFORM-010 — Heavy Platform.OS branching in shared code

- **Category**: `code`
- **Confidence**: `MEDIUM`
- **Location**: `src/features/library/screens/LikedSongsScreen.tsx:77`

**What was found:**
> Found 3 inline Platform.OS comparisons in a single shared file.

**Why it matters:**
> Heavy inline platform branching makes shared code harder to read and test, and often duplicates logic that platform-specific files would handle more cleanly.

**Official platform guidance:**
> React Native resolves .ios.js/.android.js file extensions automatically at build time for platform-specific implementations.

**Recommended fix:**
> Consider extracting the platform-specific branches into src/features/library/screens/LikedSongsScreen.ios.tsx and src/features/library/screens/LikedSongsScreen.android.tsx.

**Documentation:**
- [https://reactnative.dev/docs/platform-specific-code](https://reactnative.dev/docs/platform-specific-code)


### [SUGGESTION] RNDOCTOR-PLATFORM-010 — Heavy Platform.OS branching in shared code

- **Category**: `code`
- **Confidence**: `MEDIUM`
- **Location**: `src/features/player/screens/PlayerScreen.tsx:393`

**What was found:**
> Found 8 inline Platform.OS comparisons in a single shared file.

**Why it matters:**
> Heavy inline platform branching makes shared code harder to read and test, and often duplicates logic that platform-specific files would handle more cleanly.

**Official platform guidance:**
> React Native resolves .ios.js/.android.js file extensions automatically at build time for platform-specific implementations.

**Recommended fix:**
> Consider extracting the platform-specific branches into src/features/player/screens/PlayerScreen.ios.tsx and src/features/player/screens/PlayerScreen.android.tsx.

**Documentation:**
- [https://reactnative.dev/docs/platform-specific-code](https://reactnative.dev/docs/platform-specific-code)


### [SUGGESTION] RNDOCTOR-PLATFORM-010 — Heavy Platform.OS branching in shared code

- **Category**: `code`
- **Confidence**: `MEDIUM`
- **Location**: `src/features/player/screens/SleepTimerScreen.tsx:53`

**What was found:**
> Found 4 inline Platform.OS comparisons in a single shared file.

**Why it matters:**
> Heavy inline platform branching makes shared code harder to read and test, and often duplicates logic that platform-specific files would handle more cleanly.

**Official platform guidance:**
> React Native resolves .ios.js/.android.js file extensions automatically at build time for platform-specific implementations.

**Recommended fix:**
> Consider extracting the platform-specific branches into src/features/player/screens/SleepTimerScreen.ios.tsx and src/features/player/screens/SleepTimerScreen.android.tsx.

**Documentation:**
- [https://reactnative.dev/docs/platform-specific-code](https://reactnative.dev/docs/platform-specific-code)


### [SUGGESTION] RNDOCTOR-PLATFORM-010 — Heavy Platform.OS branching in shared code

- **Category**: `code`
- **Confidence**: `MEDIUM`
- **Location**: `src/features/player/screens/SongOptionsScreen.tsx:456`

**What was found:**
> Found 6 inline Platform.OS comparisons in a single shared file.

**Why it matters:**
> Heavy inline platform branching makes shared code harder to read and test, and often duplicates logic that platform-specific files would handle more cleanly.

**Official platform guidance:**
> React Native resolves .ios.js/.android.js file extensions automatically at build time for platform-specific implementations.

**Recommended fix:**
> Consider extracting the platform-specific branches into src/features/player/screens/SongOptionsScreen.ios.tsx and src/features/player/screens/SongOptionsScreen.android.tsx.

**Documentation:**
- [https://reactnative.dev/docs/platform-specific-code](https://reactnative.dev/docs/platform-specific-code)


### [REVIEW] AUDIO-ARCH-001 — Overlapping audio playback-state ownership

- **Category**: `architecture`
- **Confidence**: `83%`
- **Location**: `src/contexts/PlayerContext.tsx`

**What was found:**
> 7 playback-state owner candidates detected.

**Why it matters:**
> These modules expose overlapping playback terms (play, pause, queue, progress, or current track): src/contexts/PlayerContext.tsx, src/lib/miniPlayerControls.ts, src/lib/trackPlayerService.ts, src/services/audio/ExpoAvAdapter.ts, src/services/audio/PlaybackEngine.ts, src/services/audio/ShuffleManager.ts, src/services/audio/TrackPlayerAdapter.ts. This can indicate more than one playback authority.

**Official platform guidance:**
> Keep one playback controller/state authority; let UI hooks and platform adapters depend on it.

**Recommended fix:**
> Map ownership before deleting anything. Consolidate into a single playback controller.

**Do not add:**
> Do not add another manager, event emitter, polling loop, or state store before consolidating responsibilities.

**Documentation:**
- [https://reactnative.dev/docs/native-platform](https://reactnative.dev/docs/native-platform)


---

## Remediation & Next Steps

```bash
# 1. Apply safe automatic AST fixes (unused imports & legacy permissions)
npx native-doctor --fix

# 2. Re-run scan to check updated health score
npx native-doctor

# 3. Review architecture migration plan
npx native-doctor --plan
```

---
*Generated by native-doctor v0.1.0*
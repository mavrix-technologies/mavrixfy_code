# Native Doctor — Project Health Report

> **Health Score**: **86/100 [ HEALTHY ]** | Technical Debt: **HIGH**

## Project Overview

- **Target Path**: `E:\Mavrixfy\Mavrixfy_App`
- **Architecture Workflow**: `expo-bare-or-prebuilt`
- **Scanner Version**: `v0.8.0`
- **Scan Scope**: 242 relevant files (216 code files, 21 native files)
- **Execution Timing**: file scan 1064ms | static analysis 3462ms | rules run: 56

## Summary of Findings

| Severity | Count | Description |
| :--- | :---: | :--- |
| **Errors** | **0** | Action required; potential build failure, crash, or breaking misconfiguration |
| **Warnings** | **44** | Review and fix before release; architecture, performance, or native defect |
| **Suggestions** | **11** | Best-practice recommendations and modernization improvements |
| **Reviews** | **2** | Heuristic observation requiring developer investigation |

## Category Health Scores

| Category | Score | Status |
| :--- | :---: | :--- |
| **ui** | **76/100** | Good |
| **accessibility** | **100/100** | Optimal |
| **architecture** | **87/100** | Good |
| **code** | **95/100** | Optimal |
| **correctness** | **100/100** | Optimal |
| **performance** | **1/100** | Action Required |
| **native** | **100/100** | Optimal |
| **security** | **100/100** | Optimal |
| **dependencies** | **100/100** | Optimal |
| **config** | **100/100** | Optimal |

---

## Detailed Findings

### [WARNING] RNDOCTOR-UI-UNOPTIMIZED-LIST — Unvirtualized list inside ScrollView (Use FlatList or FlashList)

- **Category**: `ui`
- **Confidence**: `MEDIUM`
- **Location**: `src/features/artists/screens/ArtistDetailScreen.tsx:442`

**What was found:**
> Dynamic array .map() rendered directly inside a ScrollView without virtualization.

**Why it matters:**
> ScrollView renders all child elements at once into native memory. For long or dynamic lists, this causes high memory consumption and dropped frames.

**Official platform guidance:**
> React Native Performance Guide: Use FlatList, SectionList, or Shopify FlashList for dynamic lists so off-screen views are recycled.

**Recommended fix:**
> Replace ScrollView + .map() with <FlatList data={items} renderItem={...} /> or <FlashList estimatedItemSize={...} />.

**Do not add:**
> Do not use ScrollView for unbounded or dynamic list rendering.

**Documentation:**
- [https://reactnative.dev/docs/optimizing-flatlist-configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration)


### [WARNING] RNDOCTOR-UI-UNOPTIMIZED-LIST — Unvirtualized list inside ScrollView (Use FlatList or FlashList)

- **Category**: `ui`
- **Confidence**: `MEDIUM`
- **Location**: `src/features/downloads/screens/DownloadedSongsScreen.tsx:549`

**What was found:**
> Dynamic array .map() rendered directly inside a ScrollView without virtualization.

**Why it matters:**
> ScrollView renders all child elements at once into native memory. For long or dynamic lists, this causes high memory consumption and dropped frames.

**Official platform guidance:**
> React Native Performance Guide: Use FlatList, SectionList, or Shopify FlashList for dynamic lists so off-screen views are recycled.

**Recommended fix:**
> Replace ScrollView + .map() with <FlatList data={items} renderItem={...} /> or <FlashList estimatedItemSize={...} />.

**Do not add:**
> Do not use ScrollView for unbounded or dynamic list rendering.

**Documentation:**
- [https://reactnative.dev/docs/optimizing-flatlist-configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration)


### [WARNING] RNDOCTOR-UI-UNOPTIMIZED-LIST — Unvirtualized list inside ScrollView (Use FlatList or FlashList)

- **Category**: `ui`
- **Confidence**: `MEDIUM`
- **Location**: `src/features/library/screens/ImportSongsScreen.tsx:207`

**What was found:**
> Dynamic array .map() rendered directly inside a ScrollView without virtualization.

**Why it matters:**
> ScrollView renders all child elements at once into native memory. For long or dynamic lists, this causes high memory consumption and dropped frames.

**Official platform guidance:**
> React Native Performance Guide: Use FlatList, SectionList, or Shopify FlashList for dynamic lists so off-screen views are recycled.

**Recommended fix:**
> Replace ScrollView + .map() with <FlatList data={items} renderItem={...} /> or <FlashList estimatedItemSize={...} />.

**Do not add:**
> Do not use ScrollView for unbounded or dynamic list rendering.

**Documentation:**
- [https://reactnative.dev/docs/optimizing-flatlist-configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration)


### [WARNING] RNDOCTOR-UI-UNOPTIMIZED-LIST — Unvirtualized list inside ScrollView (Use FlatList or FlashList)

- **Category**: `ui`
- **Confidence**: `MEDIUM`
- **Location**: `src/features/library/screens/LikedSongsScreen.tsx:438`

**What was found:**
> Dynamic array .map() rendered directly inside a ScrollView without virtualization.

**Why it matters:**
> ScrollView renders all child elements at once into native memory. For long or dynamic lists, this causes high memory consumption and dropped frames.

**Official platform guidance:**
> React Native Performance Guide: Use FlatList, SectionList, or Shopify FlashList for dynamic lists so off-screen views are recycled.

**Recommended fix:**
> Replace ScrollView + .map() with <FlatList data={items} renderItem={...} /> or <FlashList estimatedItemSize={...} />.

**Do not add:**
> Do not use ScrollView for unbounded or dynamic list rendering.

**Documentation:**
- [https://reactnative.dev/docs/optimizing-flatlist-configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration)


### [WARNING] RNDOCTOR-UI-UNOPTIMIZED-LIST — Unvirtualized list inside ScrollView (Use FlatList or FlashList)

- **Category**: `ui`
- **Confidence**: `MEDIUM`
- **Location**: `src/features/notifications/screens/NotificationsScreen.tsx:557`

**What was found:**
> Dynamic array .map() rendered directly inside a ScrollView without virtualization.

**Why it matters:**
> ScrollView renders all child elements at once into native memory. For long or dynamic lists, this causes high memory consumption and dropped frames.

**Official platform guidance:**
> React Native Performance Guide: Use FlatList, SectionList, or Shopify FlashList for dynamic lists so off-screen views are recycled.

**Recommended fix:**
> Replace ScrollView + .map() with <FlatList data={items} renderItem={...} /> or <FlashList estimatedItemSize={...} />.

**Do not add:**
> Do not use ScrollView for unbounded or dynamic list rendering.

**Documentation:**
- [https://reactnative.dev/docs/optimizing-flatlist-configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration)


### [WARNING] RNDOCTOR-UI-UNOPTIMIZED-LIST — Unvirtualized list inside ScrollView (Use FlatList or FlashList)

- **Category**: `ui`
- **Confidence**: `MEDIUM`
- **Location**: `src/features/notifications/screens/NotificationsScreen.tsx:581`

**What was found:**
> Dynamic array .map() rendered directly inside a ScrollView without virtualization.

**Why it matters:**
> ScrollView renders all child elements at once into native memory. For long or dynamic lists, this causes high memory consumption and dropped frames.

**Official platform guidance:**
> React Native Performance Guide: Use FlatList, SectionList, or Shopify FlashList for dynamic lists so off-screen views are recycled.

**Recommended fix:**
> Replace ScrollView + .map() with <FlatList data={items} renderItem={...} /> or <FlashList estimatedItemSize={...} />.

**Do not add:**
> Do not use ScrollView for unbounded or dynamic list rendering.

**Documentation:**
- [https://reactnative.dev/docs/optimizing-flatlist-configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration)


### [WARNING] RNDOCTOR-UI-UNOPTIMIZED-LIST — Unvirtualized list inside ScrollView (Use FlatList or FlashList)

- **Category**: `ui`
- **Confidence**: `MEDIUM`
- **Location**: `src/features/notifications/screens/NotificationsScreen.tsx:613`

**What was found:**
> Dynamic array .map() rendered directly inside a ScrollView without virtualization.

**Why it matters:**
> ScrollView renders all child elements at once into native memory. For long or dynamic lists, this causes high memory consumption and dropped frames.

**Official platform guidance:**
> React Native Performance Guide: Use FlatList, SectionList, or Shopify FlashList for dynamic lists so off-screen views are recycled.

**Recommended fix:**
> Replace ScrollView + .map() with <FlatList data={items} renderItem={...} /> or <FlashList estimatedItemSize={...} />.

**Do not add:**
> Do not use ScrollView for unbounded or dynamic list rendering.

**Documentation:**
- [https://reactnative.dev/docs/optimizing-flatlist-configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration)


### [WARNING] RNDOCTOR-UI-UNOPTIMIZED-LIST — Unvirtualized list inside ScrollView (Use FlatList or FlashList)

- **Category**: `ui`
- **Confidence**: `MEDIUM`
- **Location**: `src/features/search/screens/SearchScreen.tsx:450`

**What was found:**
> Dynamic array .map() rendered directly inside a ScrollView without virtualization.

**Why it matters:**
> ScrollView renders all child elements at once into native memory. For long or dynamic lists, this causes high memory consumption and dropped frames.

**Official platform guidance:**
> React Native Performance Guide: Use FlatList, SectionList, or Shopify FlashList for dynamic lists so off-screen views are recycled.

**Recommended fix:**
> Replace ScrollView + .map() with <FlatList data={items} renderItem={...} /> or <FlashList estimatedItemSize={...} />.

**Do not add:**
> Do not use ScrollView for unbounded or dynamic list rendering.

**Documentation:**
- [https://reactnative.dev/docs/optimizing-flatlist-configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration)


### [WARNING] RNDOCTOR-DEADCODE-UNUSED-FILE — Unused source file / Dead code detected

- **Category**: `architecture`
- **Confidence**: `HIGH`
- **Location**: `src/lib/homeScrollRef.ts:1`

**What was found:**
> File "src/lib/homeScrollRef.ts" is not imported by any module in the project dependency graph.

**Why it matters:**
> Unused source files add dead code to the repository, increase bundle size analysis overhead, and create cognitive noise for developers.

**Official platform guidance:**
> React Native Performance Guide: Remove unused files and dead code to keep your codebase lean and optimize build times.

**Recommended fix:**
> Verify if "src/lib/homeScrollRef.ts" is needed. If it is deprecated or abandoned, remove it from the project.

**Do not add:**
> Do not keep abandoned prototype files in production source trees.

**Documentation:**
- [https://reactnative.dev/docs/optimizing-javascript-loading](https://reactnative.dev/docs/optimizing-javascript-loading)


### [WARNING] RNDOCTOR-DEADCODE-UNUSED-FILE — Unused source file / Dead code detected

- **Category**: `architecture`
- **Confidence**: `HIGH`
- **Location**: `src/lib/trackPlayerService.ts:1`

**What was found:**
> File "src/lib/trackPlayerService.ts" is not imported by any module in the project dependency graph.

**Why it matters:**
> Unused source files add dead code to the repository, increase bundle size analysis overhead, and create cognitive noise for developers.

**Official platform guidance:**
> React Native Performance Guide: Remove unused files and dead code to keep your codebase lean and optimize build times.

**Recommended fix:**
> Verify if "src/lib/trackPlayerService.ts" is needed. If it is deprecated or abandoned, remove it from the project.

**Do not add:**
> Do not keep abandoned prototype files in production source trees.

**Documentation:**
- [https://reactnative.dev/docs/optimizing-javascript-loading](https://reactnative.dev/docs/optimizing-javascript-loading)


### [WARNING] RNDOCTOR-DEADCODE-UNUSED-FILE — Unused source file / Dead code detected

- **Category**: `architecture`
- **Confidence**: `HIGH`
- **Location**: `src/lib/downloads/collectionMetadata.ts:1`

**What was found:**
> File "src/lib/downloads/collectionMetadata.ts" is not imported by any module in the project dependency graph.

**Why it matters:**
> Unused source files add dead code to the repository, increase bundle size analysis overhead, and create cognitive noise for developers.

**Official platform guidance:**
> React Native Performance Guide: Remove unused files and dead code to keep your codebase lean and optimize build times.

**Recommended fix:**
> Verify if "src/lib/downloads/collectionMetadata.ts" is needed. If it is deprecated or abandoned, remove it from the project.

**Do not add:**
> Do not keep abandoned prototype files in production source trees.

**Documentation:**
- [https://reactnative.dev/docs/optimizing-javascript-loading](https://reactnative.dev/docs/optimizing-javascript-loading)


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


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `app/_layout.tsx:285`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/contexts/AuthContext.tsx:174`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/contexts/AuthContext.tsx:216`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/contexts/AuthContext.tsx:528`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/contexts/AuthContext.tsx:532`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/contexts/DownloadContext.tsx:329`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/contexts/PlayerContext.tsx:966`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/contexts/PlayerContext.tsx:1532`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/lib/colorExtractor.ts:262`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/lib/colorExtractor.ts:404`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/lib/followedArtists.ts:44`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/lib/followedArtists.ts:49`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/lib/query-client.ts:50`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/lib/query-client.ts:72`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/lib/storage.ts:287`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/lib/storage.ts:392`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/lib/storage.ts:427`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/data/providers/ArtistProvider.ts:497`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/data/providers/JioSaavnProvider.ts:1696`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/data/providers/JioSaavnProvider.ts:1755`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/data/providers/JioSaavnProvider.ts:2301`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/data/providers/NewReleaseProvider.ts:438`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/data/providers/NewReleaseProvider.ts:466`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/data/providers/NewReleaseProvider.ts:490`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/data/providers/RecommendationProvider.ts:547`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/data/providers/RecommendationProvider.ts:559`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/lib/downloads/downloadManager.ts:166`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/lib/downloads/downloadQueue.ts:243`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/lib/downloads/downloadQueue.ts:395`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/lib/downloads/downloadQueue.ts:456`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/lib/downloads/downloadQueue.ts:483`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/lib/downloads/downloadStore.ts:66`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [WARNING] REACT-SEQUENTIAL-AWAITS — Sequential independent awaits (Run in parallel with Promise.all)

- **Category**: `performance`
- **Confidence**: `HIGH`
- **Location**: `src/lib/downloads/downloadStore.ts:170`

**What was found:**
> Sequential independent await expression detected.

**Why it matters:**
> This await does not depend on the previous await result. Running independent asynchronous operations sequentially causes unnecessary waterfall latency.

**Official platform guidance:**
> React Doctor Performance Guide: Wrap independent async operations in Promise.all([...]) so they execute concurrently.

**Recommended fix:**
> Wrap the independent awaits in Promise.all([ ... ]) so they run at the same time in parallel.

**Do not add:**
> Do not leave independent network requests or file reads waiting sequentially.

**Documentation:**
- [https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await](https://react.doctor/docs/rules/react-doctor/server-sequential-independent-await)


### [REVIEW] AUDIO-ARCH-001 — Overlapping audio playback-state ownership

- **Category**: `architecture`
- **Confidence**: `75%`
- **Location**: `src/contexts/PlayerContext.tsx`

**What was found:**
> 5 playback-state owner candidates detected.

**Why it matters:**
> These modules expose overlapping playback terms (play, pause, queue, progress, or current track): src/contexts/PlayerContext.tsx, src/lib/miniPlayerControls.ts, src/lib/trackPlayerService.ts, src/services/audio/PlaybackEngine.ts, src/services/audio/ShuffleManager.ts. This can indicate more than one playback authority.

**Official platform guidance:**
> Keep one playback controller/state authority; let UI hooks and platform adapters depend on it.

**Recommended fix:**
> Map ownership before deleting anything. Consolidate into a single playback controller.

**Do not add:**
> Do not add another manager, event emitter, polling loop, or state store before consolidating responsibilities.

**Documentation:**
- [https://reactnative.dev/docs/native-platform](https://reactnative.dev/docs/native-platform)


### [REVIEW] AUDIO-ARCH-001 — Overlapping audio playback-state ownership

- **Category**: `architecture`
- **Confidence**: `HIGH`
- **Location**: `plugins/withIOSAVPlayer.js`

**What was found:**
> Modules declaring overlapping playback state terms: plugins/withIOSAVPlayer.js, src/contexts/PlayerContext.tsx, src/features/player/screens/PlayerScreen.tsx.

**Why it matters:**
> Having multiple components or contexts managing playback progress, track state, and play/pause state leads to out-of-sync UI and conflicting audio events.

**Official platform guidance:**
> React Native Audio Guidance: Maintain a single playback controller as the sole source of truth.

**Recommended fix:**
> Map ownership and consolidate state into a single authoritative playback service/store.

**Do not add:**
> Do not add another state store, manager, polling loop, or event emitter before consolidating responsibilities.


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
*Generated by native-doctor v0.8.0*
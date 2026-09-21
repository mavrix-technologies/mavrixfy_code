# Native Doctor — Project Health Report

> **Health Score**: **97/100 [ EXCELLENT ]** | Technical Debt: **MEDIUM**

## Project Overview

- **Target Path**: `E:\Mavrixfy\Mavrixfy_App`
- **Architecture Workflow**: `expo-bare-or-prebuilt`
- **Scanner Version**: `v0.8.0`
- **Scan Scope**: 333 relevant files (308 code files, 20 native files)
- **Execution Timing**: file scan 1016ms | static analysis 2272ms | rules run: 16

## Summary of Findings

| Severity | Count | Description |
| :--- | :---: | :--- |
| **Errors** | **0** | Action required; potential build failure, crash, or breaking misconfiguration |
| **Warnings** | **4** | Review and fix before release; architecture, performance, or native defect |
| **Suggestions** | **0** | Best-practice recommendations and modernization improvements |
| **Reviews** | **1** | Heuristic observation requiring developer investigation |

## Category Health Scores

| Category | Score | Status |
| :--- | :---: | :--- |
| **ui** | **100/100** | Optimal |
| **accessibility** | **100/100** | Optimal |
| **architecture** | **83/100** | Good |
| **code** | **100/100** | Optimal |
| **correctness** | **100/100** | Optimal |
| **performance** | **100/100** | Optimal |
| **native** | **100/100** | Optimal |
| **security** | **100/100** | Optimal |
| **dependencies** | **100/100** | Optimal |
| **config** | **100/100** | Optimal |

## 12-Dimension Mobile Health Scorecard

| Dimension | Score | Status | Focus Area |
| :--- | :---: | :--- | :--- |
| **Performance (Render)** | **100/100** | Healthy | UI re-renders, unmemoized array transforms |
| **Smoothness / FPS** | **100/100** | Healthy | JS-driven animations, 60fps frame drops |
| **Memory & Leak Safety** | **100/100** | Healthy | Event listener leaks, lingering subscriptions |
| **CPU & Thermal Health** | **100/100** | Healthy | Runaway timers, background workers |
| **Battery & Background** | **100/100** | Healthy | High-frequency progress bridge intervals |
| **Cold Startup / TTI** | **100/100** | Healthy | Synchronous storage reads during launch |
| **Network & Waterfalls** | **100/100** | Healthy | Sequential independent awaits |
| **Native Toolchain** | **100/100** | Healthy | Android 14+ FGS, permissions, CocoaPods |
| **Correctness & Safety** | **100/100** | Healthy | Race conditions, edge-case safety |
| **Code Quality (DRY)** | **90/100** | Healthy | Dead code, duplicate utilities |
| **Architecture & Layers** | **58/100** | Action Needed | Single responsibility, layer boundaries |
| **Build & Store Health** | **100/100** | Healthy | 16 KB pages, targetSdk 34, privacy manifests |
| **OVERALL MOBILE SCORE** | **97/100** | **EXCELLENT** | Holistic weighted mobile index |

---

## Project Behavioral Baseline Audit

> The project behavioral baseline captures the live application structure before any fixes are applied, ensuring zero regression.

| Baseline Dimension | Monitored Count | Status |
| :--- | :---: | :--- |
| **Registered Routes** | **32** | Monitored ✓ |
| **Navigation Screens** | **23** | Monitored ✓ |
| **React Components** | **103** | Monitored ✓ |
| **Native Modules & Bridge** | **47** | Monitored ✓ |
| **API Endpoints** | **5** | Monitored ✓ |
| **Persistent Storage Keys** | **2** | Monitored ✓ |
| **Declared Permissions** | **24** | Monitored ✓ |
| **Expo Config Plugins** | **17** | Monitored ✓ |
| **Android Services** | **0** | Monitored ✓ |
| **iOS Capabilities** | **0** | Monitored ✓ |

---

## Deep Architecture & 5-Pillar Feature Matrix

| Feature Domain | Status | JS Layer | Android Native | iOS Native | Build Config | Docs |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Audio Playback Subsystem** | `WARNING` | ▲ | ✓ | — | ✓ | ✓ |
| **Push Notifications** | `HEALTHY` | ✓ | ✓ | — | ✓ | ✓ |
| **Deep Linking & Universal Links** | `HEALTHY` | ✓ | ✓ | — | ✓ | ✓ |
| **Background Processing & Execution** | `HEALTHY` | ✓ | ✓ | — | ✓ | ✓ |
| **Camera & Media Capture** | `HEALTHY` | ✓ | ✓ | — | ✓ | ✓ |
| **App Routing & Screen Navigation** | `WARNING` | ▲ | ✓ | ▲ | ✓ | ✓ |

---

## Codebase Cleanup & Simplification Intelligence

| Category | Detected Items | Risk Level | Remediation |
| :--- | :---: | :--- | :--- |
| **Dead / Unused Code** | **0** | Low | Verify reachability, safely prune unreachable exports |
| **Unused Dependencies** | **0** | Low | Remove from package.json to trim bundle |
| **Duplicate Logic / Utilities** | **0** | Medium | Consolidate duplicate helper functions |
| **Over-Complex Functions** | **2** | Medium | Decompose into smaller focused pure functions |
| **Unnecessary Abstractions** | **0** | Medium | Simplify pass-through wrappers |
| **Organization / SRP Smells** | **2** | Medium | Separate mixed concerns |

---

## Build & Release Preflight (Store Readiness)

> **Preflight Status**: **PASSED WITH WARNINGS** | Blockers: **0** | Warnings: **1** | Passed: **7**

| Check | Status | Detail |
| :--- | :---: | :--- |
| **EAS Build Profiles Configured** | `PASS` | Detected 16 build profile(s): development, preview, ios-simulator, ios-optimized, ios-unsigned, ios-ipa, production, production-arm, production-optimized, playstore-aab, production-aab, production-arm64, production-ultra-small, production-universal, production-split, production-armeabi-v7a. |
| **Version String Synchronized** | `PASS` | Consistent version '3.2.0' across app.json and package.json. |
| **App Icon Configured** | `PASS` | Found valid app icon at './assets/images/mavrixfy_icon.png'. |
| **Android Adaptive Icon Configured** | `PASS` | Adaptive icon foreground image found at './assets/images/mavrixfy_icon_foreground.png'. |
| **Target SDK Level Compliant (API 34)** | `PASS` | App targets Android 14 (API 34), meeting Google Play Store requirements. |
| **Android versionCode Configured (32002)** | `PASS` | versionCode is set to 32002. |
| **Missing Apple Privacy Manifest (PrivacyInfo.xcprivacy)** | `WARNING` | App Store Connect enforces PrivacyInfo.xcprivacy for apps consuming Required Reason APIs (User Defaults, Disk Space, System Boot). *(Fix: Add PrivacyInfo.xcprivacy to your Xcode project root declaring NSPrivacyAccessedAPITypes.)* |
| **iOS Build Number Configured (32002)** | `PASS` | buildNumber is set to '32002'. |

---

## Safe Existing-Project Preservation & Hard-Locks

> Native Doctor guarantees safe preservation of working applications. Destructive rewrites and blind deletions are blocked by default.

- **Preservation Mode**: `ACTIVE` (Strict change budget: Max 1 file, Max 5 lines per patch)
- **Hard-Locked Findings**: **0** protected critical/native finding(s) (recommendation-only)

---

## Detailed Findings

### [REVIEW] AUDIO-ARCH-001 — Overlapping audio playback-state ownership

- **Category**: `architecture`
- **Confidence**: `HIGH`
- **Location**: `src/contexts/PlayerContext.tsx`
- **File Classification**: `SAFE_SOURCE`

**What was found:**
> Modules declaring overlapping playback state terms: src/contexts/PlayerContext.tsx, src/features/player/hooks/useLegacyPlayerViewState.ts, src/features/player/screens/PlayerScreen.tsx.

**Why it matters:**
> Having multiple components or contexts managing playback progress, track state, and play/pause state leads to out-of-sync UI and conflicting audio events.

**Official platform guidance:**
> React Native Audio Guidance: Maintain a single playback controller as the sole source of truth.

**Recommended fix:**
> Map ownership and consolidate state into a single authoritative playback service/store.

**Do not add:**
> Do not add another state store, manager, polling loop, or event emitter before consolidating responsibilities.


### [WARNING] RNDOCTOR-LAYER-VIOLATION — Architectural Layer Boundary Violation (DOMAIN → UI)

- **Category**: `architecture`
- **Confidence**: `HIGH`
- **Location**: `src/features/navigation/AppNavBar.tsx`
- **File Classification**: `SAFE_SOURCE`

**What was found:**
> src/features/navigation/AppNavBar.tsx (DOMAIN) imports src/components/PingPongScroll.tsx (UI).

**Why it matters:**
> Lower architectural layers (Services, Data, Domain) must remain decoupled from presentation components to ensure testability and prevent cyclic re-renders.

**Official platform guidance:**
> Software Architecture Guidance: Dependencies must point inwards towards pure domain logic, never backwards to UI components.

**Recommended fix:**
> Pass UI callbacks or handlers via function arguments or use event listeners / reactive hooks.

**Do not add:**
> Do not add a circular barrel export or import Screens directly into services.


### [WARNING] RNDOCTOR-LAYER-VIOLATION — Architectural Layer Boundary Violation (DOMAIN → UI)

- **Category**: `architecture`
- **Confidence**: `HIGH`
- **Location**: `src/features/navigation/AppNavBar.tsx`
- **File Classification**: `SAFE_SOURCE`

**What was found:**
> src/features/navigation/AppNavBar.tsx (DOMAIN) imports src/features/navigation/miniPlayerComponents.tsx (UI).

**Why it matters:**
> Lower architectural layers (Services, Data, Domain) must remain decoupled from presentation components to ensure testability and prevent cyclic re-renders.

**Official platform guidance:**
> Software Architecture Guidance: Dependencies must point inwards towards pure domain logic, never backwards to UI components.

**Recommended fix:**
> Pass UI callbacks or handlers via function arguments or use event listeners / reactive hooks.

**Do not add:**
> Do not add a circular barrel export or import Screens directly into services.


### [WARNING] RNDOCTOR-LAYER-VIOLATION — Architectural Layer Boundary Violation (DOMAIN → UI)

- **Category**: `architecture`
- **Confidence**: `HIGH`
- **Location**: `src/features/navigation/IOSMiniBarOverlay.tsx`
- **File Classification**: `SAFE_SOURCE`

**What was found:**
> src/features/navigation/IOSMiniBarOverlay.tsx (DOMAIN) imports src/components/PingPongScroll.tsx (UI).

**Why it matters:**
> Lower architectural layers (Services, Data, Domain) must remain decoupled from presentation components to ensure testability and prevent cyclic re-renders.

**Official platform guidance:**
> Software Architecture Guidance: Dependencies must point inwards towards pure domain logic, never backwards to UI components.

**Recommended fix:**
> Pass UI callbacks or handlers via function arguments or use event listeners / reactive hooks.

**Do not add:**
> Do not add a circular barrel export or import Screens directly into services.


### [WARNING] RNDOCTOR-LAYER-VIOLATION — Architectural Layer Boundary Violation (DOMAIN → UI)

- **Category**: `architecture`
- **Confidence**: `HIGH`
- **Location**: `src/features/navigation/IOSMiniBarOverlay.tsx`
- **File Classification**: `SAFE_SOURCE`

**What was found:**
> src/features/navigation/IOSMiniBarOverlay.tsx (DOMAIN) imports src/features/navigation/miniPlayerComponents.tsx (UI).

**Why it matters:**
> Lower architectural layers (Services, Data, Domain) must remain decoupled from presentation components to ensure testability and prevent cyclic re-renders.

**Official platform guidance:**
> Software Architecture Guidance: Dependencies must point inwards towards pure domain logic, never backwards to UI components.

**Recommended fix:**
> Pass UI callbacks or handlers via function arguments or use event listeners / reactive hooks.

**Do not add:**
> Do not add a circular barrel export or import Screens directly into services.


### [MEDIUM] RNDOCTOR-ORG-GIANT-FILE — Overly Large Source Module: colorExtractor.ts (903 LOC)

- **Category**: `complexity`
- **Confidence**: `HIGH`
- **Location**: `src/lib/colorExtractor.ts`
- **File Classification**: `SAFE_SOURCE`

**What was found:**
> src/lib/colorExtractor.ts has 903 lines of code.

**Why it matters:**
> Monolithic source files degrade IDE responsiveness, make code reviews cumbersome, and conceal subtle side-effect dependencies.

**Recommended fix:**
> Split hooks, helper utilities, and sub-components into dedicated submodules.


### [MEDIUM] RNDOCTOR-ORG-GIANT-FILE — Overly Large Source Module: ArtistDetailScreen.tsx (1223 LOC)

- **Category**: `complexity`
- **Confidence**: `HIGH`
- **Location**: `src/features/artists/screens/ArtistDetailScreen.tsx`
- **File Classification**: `SAFE_SOURCE`

**What was found:**
> src/features/artists/screens/ArtistDetailScreen.tsx has 1223 lines of code.

**Why it matters:**
> Monolithic source files degrade IDE responsiveness, make code reviews cumbersome, and conceal subtle side-effect dependencies.

**Recommended fix:**
> Split hooks, helper utilities, and sub-components into dedicated submodules.


---

## Remediation & Next Steps

```bash
# 1. Apply safe automatic AST fixes (unused imports & legacy permissions)
npx native-doctor --fix

# 2. Safely preview a targeted patch within change budget
npx native-doctor patch <findingId> --dry-run

# 3. Run full scan and 12-dimension health audit
npx native-doctor --full-scan

# 4. Run performance and runtime audit
npx native-doctor performance
```

---
*Generated by native-doctor v0.8.0 — Developed by Mavrix Technologies*
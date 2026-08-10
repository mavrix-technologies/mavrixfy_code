# ✅ iOS Simulator IPA Build (Official Method)

## What This Builds

Creates a proper **IPA file** for **iOS Simulator** using the official xcodebuild method.

**File Format:** `Mavrixfy-Simulator.ipa` (standard iOS app package)

This is:
- ✅ **IPA Format** - Standard iOS app package (zip with Payload folder)
- ✅ **Simpler** - No code signing required
- ✅ **Faster** - Simulator builds are quicker
- ✅ **Official** - Uses Apple's standard xcodebuild
- ✅ **Free** - No Apple Developer Account needed

## Key Differences: Simulator vs Device

### iOS Simulator Build (Current)
```bash
-sdk iphonesimulator
-destination 'generic/platform=iOS Simulator'
Output: Release-iphonesimulator/*.app
```

### iOS Device Build (What Failed)
```bash
-sdk iphoneos
-destination 'generic/platform=iOS'
Output: Release-iphoneos/*.app (needs signing)
```

## Official Configuration

Based on:
- [Expo Simulator Build Docs](https://docs.expo.dev/build-reference/simulators/)
- [GitHub Actions iOS Composite Action](https://github.com/callstackincubator/agent-skills/blob/main/skills/github-actions/references/gha-ios-composite-action.md)
- [GitHub Actions Starter Workflows](https://github.com/actions/starter-workflows/blob/main/ci/ios.yml)

Content was rephrased for compliance with licensing restrictions.

## How It Works

### 1. Build Command
```bash
xcodebuild \
  -workspace Mavrixfy.xcworkspace \
  -scheme Mavrixfy \
  -configuration Release \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO \
  build
```

### 2. Output Location
```
ios/build/Build/Products/Release-iphonesimulator/Mavrixfy.app
```

### 3. Packaging
```bash
# Create IPA structure
mkdir -p Payload
cp -r Mavrixfy.app Payload/

# Create IPA (zip file)
zip -r -q -9 Mavrixfy-Simulator.ipa Payload
```

**IPA Structure:**
```
Mavrixfy-Simulator.ipa (ZIP file)
└── Payload/
    └── Mavrixfy.app/
        ├── Info.plist
        ├── Mavrixfy (binary)
        └── ... (resources)
```

## Installation on Simulator

### Method 1: Extract and Drag (Easiest)
```bash
# Unzip the IPA
unzip Mavrixfy-Simulator.ipa

# Open iOS Simulator (Xcode → Open Developer Tool → Simulator)
# Drag Payload/Mavrixfy.app onto the simulator window
```

### Method 2: Command Line
```bash
# Extract the IPA
unzip Mavrixfy-Simulator.ipa

# Install on booted simulator
xcrun simctl install booted Payload/Mavrixfy.app

# Launch the app
xcrun simctl launch booted com.mavrixfy.app
```

### Method 3: Double-click
1. Download `Mavrixfy-Simulator.ipa`
2. Change extension to `.zip`: `Mavrixfy-Simulator.zip`
3. Double-click to extract
4. Drag `Payload/Mavrixfy.app` to simulator

## Running the Workflow

### Manual Trigger
1. Go to **Actions** tab
2. Select **"iOS Simulator Build (Unsigned)"**
3. Click **"Run workflow"**
4. Wait ~15-20 minutes

### Automatic Trigger
- Pushes to `main` or `master` branch

### Download Options

**From Artifacts:**
1. Go to completed workflow run
2. Download `Mavrixfy-iOS-Simulator-IPA`

**From Releases:**
1. Go to Releases page
2. Find `ios-simulator-v*` release
3. Download `Mavrixfy-Simulator.ipa`

## Why Simulator Instead of Device?

| Feature | Simulator | Device |
|---------|-----------|--------|
| Code Signing | ❌ Not needed | ✅ Required |
| Apple Account | ❌ Not needed | ✅ Required |
| Installation | ✅ Drag & drop | ⚠️ Needs sideloading |
| Testing | ✅ Perfect for QA | ✅ Real device testing |
| Speed | ✅ Faster build | ⚠️ Slower build |
| Distribution | ⚠️ Devs only (need Mac) | ✅ Anyone with sideloading |

## Simulator App Limitations

⚠️ **Cannot run on physical devices**
- Compiled for x86_64/arm64 simulator architecture
- Missing codesign entitlements
- Different binary format

✅ **Perfect for:**
- Development testing
- QA validation
- PR checks
- CI/CD testing
- Developer previews

## Converting to Device Build

If you later want a device build, you'll need to:
1. Change `-sdk iphonesimulator` → `-sdk iphoneos`
2. Change output path `Release-iphonesimulator` → `Release-iphoneos`
3. Add proper code signing (requires Apple Developer Account)
4. Create IPA instead of .app.tar.gz

## Workflow Details

- **Runner:** `macos-15` (consistent Xcode version)
- **Node:** 22
- **Build Time:** ~15-20 minutes
- **Output:** `.ipa` (standard iOS package, ~50-100 MB)
- **Retention:** 14 days
- **Cost:** FREE (GitHub Actions)

## Success Indicators

✅ Build succeeded if you see:
```
✅ Found Mavrixfy.app
✅ Simulator app packaged successfully!
```

## Troubleshooting

### Build fails at xcodebuild step
- Check CocoaPods installation
- Verify scheme name is correct
- Look for compilation errors in logs

### App not found after build
- Check the actual output directory
- Verify build configuration is "Release"
- Look at xcodebuild logs

### Cannot install on simulator
- Ensure you extracted the tar.gz first
- Try different simulator device
- Restart simulator and try again

### "App is damaged" error
- This shouldn't happen with simulator builds
- Re-download and extract fresh copy

## Technical Reference

### Build Configuration
- **SDK:** iphonesimulator (not iphoneos)
- **Destination:** generic/platform=iOS Simulator
- **Configuration:** Release (optimized)
- **Code Signing:** Disabled (not needed for simulator)

### Output Structure
```
ios/build/Build/Products/Release-iphonesimulator/
└── Mavrixfy.app/
    ├── Info.plist
    ├── Mavrixfy (binary)
    ├── Assets.car
    └── ... (other resources)
```

### Package Format
- **Format:** IPA (iOS App Store Package)
- **Structure:** ZIP file containing Payload/Mavrixfy.app
- **Compatible with:** iOS Simulator, some sideloading tools
- **Standard:** Same format as App Store IPAs (but unsigned)

## Official References

- [Expo Simulator Builds](https://docs.expo.dev/build-reference/simulators/)
- [React Native iOS Guide](https://reactnative.dev/docs/running-on-simulator-ios)
- [Xcodebuild Manual](https://developer.apple.com/library/archive/technotes/tn2339/)
- [GitHub Actions iOS Examples](https://github.com/actions/starter-workflows/blob/main/ci/ios.yml)

---

**Method:** Official iOS Simulator Build
**Status:** ✅ Production Ready
**Last Updated:** 2026-08-10

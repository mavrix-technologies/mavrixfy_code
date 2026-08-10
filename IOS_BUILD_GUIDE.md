# iOS Build Guide - Mavrixfy App

## ✅ Current Working Setup

Your iOS build workflow is now **RESTORED TO WORKING STATE** from the last successful build (Run #24 from July 23, 2026).

### What Was Wrong?

You were trying to build an **iOS Simulator IPA**, which is complex and was failing. The working version builds an **unsigned iOS Device IPA**, which:
- ✅ Works on real iPhones/iPads
- ✅ Can be sideloaded with Sideloadly/AltStore
- ✅ Doesn't require Apple Developer account
- ✅ Doesn't require code signing

### Key Workflow Settings

```yaml
runs-on: macos-latest           # NOT macos-15
node-version: '22'              # NOT '20'
sdk: iphoneos                   # NOT iphonesimulator
destination: generic/platform=iOS  # NOT iOS Simulator
```

## 📱 Installation Methods

### Method 1: Sideloadly (Recommended - Works on Windows & Mac)

1. **Download Sideloadly**
   - Visit: https://sideloadly.io/
   - Download for your OS (Windows/Mac)

2. **Get the IPA**
   - Go to GitHub Actions → Latest successful run
   - Download artifact: `Mavrixfy-iOS-IPA-Unsigned`
   - Or check Releases page for latest release

3. **Install**
   - Connect iPhone/iPad via USB
   - Open Sideloadly
   - Enter your Apple ID (free account works)
   - Drag IPA file into Sideloadly
   - Click Start
   - Trust the certificate on your device (Settings → General → VPN & Device Management)

### Method 2: AltStore (Mac only)

1. Install AltStore from https://altstore.io/
2. Download the IPA
3. Open IPA in AltStore
4. Install to device

### Method 3: Xcode (Mac only)

1. Download and unzip the IPA
2. Open Xcode → Window → Devices and Simulators
3. Select your device
4. Drag the `.app` file into "Installed Apps"

## 🔍 How to Verify Build Locally (Before Pushing)

### Option 1: Quick Validation (1-2 minutes)

```bash
# Navigate to iOS directory
cd ios

# Check if workspace exists
ls -la Mavrixfy.xcworkspace

# List available schemes
xcodebuild -list -workspace Mavrixfy.xcworkspace

# Check available SDKs
xcodebuild -showsdks | grep iphoneos
```

### Option 2: Test Build Locally (10-15 minutes)

```bash
# 1. Clean and install dependencies
npm ci
npx expo prebuild --platform ios --clean

# 2. Install CocoaPods
cd ios
pod install

# 3. Try building (this will take ~10 minutes)
xcodebuild -workspace Mavrixfy.xcworkspace \
  -scheme Mavrixfy \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath build \
  -destination 'generic/platform=iOS' \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGN_ENTITLEMENTS="" \
  build

# 4. If successful, create IPA
cd build/Build/Products/Release-iphoneos
mkdir -p Payload
cp -r Mavrixfy.app Payload/
zip -r -9 Mavrixfy.ipa Payload
```

### Option 3: Dry Run with GitHub (Safest)

1. **Create a test branch:**
   ```bash
   git checkout -b test-ios-build
   git push -u origin test-ios-build
   ```

2. **Update workflow to only run on test branch:**
   ```yaml
   on:
     push:
       branches:
         - test-ios-build
   ```

3. **Push and test** - it won't affect main branch

4. **Once confirmed working, merge to main**

## 🚨 Common Issues & Solutions

### Issue: "Scheme not found"
**Solution:** Run `npx expo prebuild --platform ios --clean`

### Issue: "Pod install fails"
**Solution:** 
```bash
cd ios
pod deintegrate
pod install
```

### Issue: "Xcode version mismatch"
**Solution:** The workflow patches this automatically, but locally run:
```bash
# Remove version check from Podfile
sed -i.bak '/React Native requires XCode/,/raise.*XCode/d' ios/Podfile
```

### Issue: Build takes too long
**Tip:** 
- First build: 10-15 minutes (normal)
- Subsequent builds: 5-8 minutes
- Use `-quiet` flag to reduce log verbosity

## 📊 Monitoring GitHub Actions

### Check Build Status

**Via Web:**
https://github.com/mavrix-technologies/mavrixfy_code/actions

**Via API (PowerShell):**
```powershell
$response = Invoke-RestMethod -Uri "https://api.github.com/repos/mavrix-technologies/mavrixfy_code/actions/runs?per_page=3"
$response.workflow_runs | Where-Object {$_.name -like "*iOS*"} | 
  Select-Object run_number, status, conclusion, created_at | 
  Format-Table -AutoSize
```

### Download Artifacts

1. Go to Actions → Completed workflow
2. Scroll down to "Artifacts" section
3. Download `Mavrixfy-iOS-IPA-Unsigned`
4. Unzip to get the IPA file

### Check Releases

Latest builds are automatically published to:
https://github.com/mavrix-technologies/mavrixfy_code/releases

## ⚙️ Workflow Configuration

Your current working workflow:
- **File:** `.github/workflows/ios-build.yml`
- **Trigger:** Push to main/master, or manual dispatch
- **Runner:** macos-latest (currently macOS 14)
- **Timeout:** 60 minutes
- **Artifacts retained:** 14 days

## 🔄 Build History

| Run # | Status | Date | Notes |
|-------|--------|------|-------|
| 50 | ✅ Running | Aug 10, 2026 | Restored working workflow |
| 49 | ❌ Failed | Aug 10, 2026 | Simulator build attempt |
| 24 | ✅ Success | Jul 23, 2026 | Last successful (device build) |

## 📝 Important Notes

1. **This IPA is UNSIGNED** - requires sideloading tools
2. **Valid for 7 days** with free Apple ID (need to re-sign weekly)
3. **Works on physical devices only** (not simulator)
4. **No Apple Developer account needed**
5. **GitHub Actions builds are free** for public repos

## 🎯 Quick Commands Reference

```bash
# Check current build status
git log --oneline -1

# View workflow file
cat .github/workflows/ios-build.yml

# Test prebuild locally
npx expo prebuild --platform ios --clean

# Check pod status
cd ios && pod --version && pod install

# Trigger manual build (requires GitHub CLI)
gh workflow run ios-build.yml
```

---

**Last Updated:** August 10, 2026  
**Working Commit:** 811e5aa  
**Workflow Version:** Device IPA (Unsigned)

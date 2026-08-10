# iOS Unsigned Build Instructions

## 🎯 Overview

This GitHub Actions workflow creates **unsigned iOS IPA files** without requiring an Apple Developer Account or any certificates. The workflow is completely free and runs automatically on GitHub's infrastructure.

## ✅ Key Changes Made

### 1. **Proper Archive Creation**
- Changed from `xcodebuild build` to `xcodebuild archive`
- This is the correct way to create distributable iOS apps

### 2. **Correct IPA Packaging**
- The IPA is now created from the archive's `Applications` folder
- Properly renamed to `Payload` as required by iOS IPA format
- Correct path: `Mavrixfy.xcarchive/Products/Applications/` → `Payload/`

### 3. **Code Signing Disabled**
All code signing requirements removed:
- `CODE_SIGN_IDENTITY=""`
- `CODE_SIGNING_REQUIRED=NO`
- `CODE_SIGNING_ALLOWED=NO`
- `DEVELOPMENT_TEAM=""`
- `PROVISIONING_PROFILE_SPECIFIER=""`

### 4. **Better Error Handling**
- Verification steps after archive creation
- Detailed logging to debug issues
- Checks for required folders before proceeding

### 5. **Improved Release Notes**
- Better formatted GitHub releases
- Clear installation instructions
- Technical details for users

## 🚀 How to Use

### Trigger the Workflow

**Option 1: Manual Trigger**
1. Go to your repository on GitHub
2. Click `Actions` tab
3. Select `iOS IPA Build (Unsigned)`
4. Click `Run workflow`
5. Wait 15-30 minutes for completion

**Option 2: Automatic Trigger**
- Push to `main` or `master` branch
- Workflow runs automatically

### Download the IPA

**From Artifacts:**
1. Go to the completed workflow run
2. Scroll to "Artifacts" section
3. Download `Mavrixfy-iOS-IPA-Unsigned`

**From Releases:**
1. Go to repository Releases
2. Find latest `ios-unsigned-v*` release
3. Download `Mavrixfy.ipa`

## 📱 Installing the Unsigned IPA

Since this IPA is **NOT signed**, you cannot install it directly. You need one of these tools:

### Option 1: Sideloadly (Recommended)
- **Platform:** Windows & macOS
- **Free:** Yes
- **Expiry:** 7 days (with free Apple ID)
- **Website:** https://sideloadly.io/
- **Steps:**
  1. Download and install Sideloadly
  2. Connect your iPhone via USB
  3. Drag the IPA into Sideloadly
  4. Sign in with your Apple ID
  5. Click "Start"

### Option 2: AltStore
- **Platform:** Windows, macOS, Linux (with AltServer)
- **Free:** Yes
- **Expiry:** 7 days (auto-refresh available)
- **Website:** https://altstore.io/
- **Steps:**
  1. Install AltStore on your device
  2. Install AltServer on your computer
  3. Connect device to same WiFi
  4. Use AltStore to install the IPA

### Option 3: TrollStore (Jailbroken/Permanent)
- **Platform:** iOS 14.0 - 16.6.1
- **Free:** Yes
- **Expiry:** Never (permanent install)
- **Requirement:** Specific iOS version vulnerability
- **Website:** https://github.com/opa334/TrollStore

### Option 4: Cydia Impactor (Outdated)
- **Status:** No longer maintained
- **Not recommended**

## ⚠️ Important Notes

1. **Unsigned = Not Trusted**
   - iOS will show security warnings
   - You need to trust the certificate in Settings

2. **7-Day Expiry (Free Apple ID)**
   - Apps signed with free Apple ID expire after 7 days
   - Need to re-sign every week
   - Use paid Developer Account ($99/year) for 1-year certificates

3. **Device Limit**
   - Free Apple ID: 3 apps max at a time
   - Paid account: More flexibility

4. **First Launch**
   - Go to Settings → General → VPN & Device Management
   - Trust your Apple ID
   - Then launch the app

## 🔧 Troubleshooting

### Build Fails at Archive Step
- Check Xcode compatibility
- Ensure Podfile doesn't have strict version requirements
- Verify all dependencies installed

### Archive Created but IPA Missing
- Check if `Applications` folder exists in archive
- Verify app name matches scheme name
- Look at workflow logs for path issues

### IPA Too Large
- Normal size: 50-150 MB
- If larger, check for unnecessary assets
- Consider using asset catalogs

### Cannot Install IPA
- Verify device is in Developer Mode (iOS 16+)
- Check device compatibility (iOS 15.1+)
- Try different sideloading tool
- Ensure device is trusted on your computer

## 📊 Workflow Details

- **Runner:** macOS-latest (GitHub-hosted)
- **Timeout:** 60 minutes
- **Node Version:** 22
- **Ruby Version:** 3.2
- **Expo:** Latest via npx
- **Cost:** FREE (GitHub Actions included in free tier)

## 🔄 Workflow Steps

1. ✅ Checkout repository
2. ✅ Setup Node.js 22
3. ✅ Install npm dependencies
4. ✅ Run Expo prebuild for iOS
5. ✅ Patch Podfile (if needed)
6. ✅ Setup Ruby 3.2
7. ✅ Install CocoaPods dependencies
8. ✅ List available schemes (debug info)
9. ✅ Build unsigned archive
10. ✅ Verify archive creation
11. ✅ Create IPA from archive
12. ✅ Upload as artifact
13. ✅ Create GitHub release

## 📝 Technical Reference

### Archive Structure
```
Mavrixfy.xcarchive/
└── Products/
    └── Applications/
        └── Mavrixfy.app/
```

### IPA Structure
```
Mavrixfy.ipa (ZIP file containing:)
└── Payload/
    └── Mavrixfy.app/
```

### Required xcodebuild Flags
```bash
xcodebuild archive \
  -workspace Mavrixfy.xcworkspace \
  -scheme Mavrixfy \
  -configuration Release \
  -sdk iphoneos \
  -archivePath Mavrixfy.xcarchive \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=NO
```

## 🎉 Success Indicators

A successful build will show:
- ✅ Archive created successfully
- ✅ Found Mavrixfy.app in Payload
- ✅ IPA created successfully!
- 📦 Artifact uploaded
- 🏷️ Release created

## 🆘 Need Help?

1. Check workflow logs in Actions tab
2. Look for red ❌ indicators in steps
3. Read error messages carefully
4. Compare with successful builds

## 📚 Resources

- [Expo Prebuild Documentation](https://docs.expo.dev/workflow/prebuild/)
- [Xcodebuild Manual](https://developer.apple.com/documentation/xcode)
- [iOS App Distribution](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases)
- [Sideloadly Guide](https://sideloadly.io/documentation)
- [AltStore Guide](https://altstore.io/faq/)

---

**Last Updated:** 2026-08-10
**Workflow Version:** 2.0 (Archive-based)
**Status:** ✅ Production Ready

# iOS IPA Build Instructions

This repository includes a GitHub Actions workflow to build an unsigned IPA file for iOS without requiring an Apple Developer account.

## 🚀 How to Build IPA

### Method 1: Using GitHub Actions (Recommended)

1. **Go to GitHub Actions**
   - Visit: https://github.com/satvik8373/Mavrixfy_App_code/actions

2. **Select the Workflow**
   - Click on "iOS-ipa-build" from the workflows list

3. **Run the Workflow**
   - Click "Run workflow" button
   - Select branch: `master`
   - Click "Run workflow"

4. **Wait for Build to Complete**
   - The build takes approximately 15-20 minutes
   - You can watch the progress in real-time

5. **Download the IPA**
   - Once complete, go to the workflow run
   - Scroll down to "Artifacts" section
   - Download "Mavrixfy-iOS-IPA"
   - Or check the Releases page for the IPA file

### Method 2: Using EAS Build (Requires Expo Account)

1. **Setup Expo Token**
   - Get token from: https://expo.dev/accounts/satvik1234/settings/access-tokens
   - Add to GitHub Secrets as `EXPO_TOKEN`

2. **Run EAS Build Workflow**
   - Go to Actions → "iOS-EAS-Build"
   - Click "Run workflow"

## ⚠️ Important Notes

### About Unsigned IPA
- The IPA built by this workflow is **unsigned**
- It will **NOT install on regular iOS devices**
- It can only be used for:
  - iOS Simulators
  - Jailbroken devices
  - Development purposes

### To Install on Real Devices
You need one of these options:
1. **Apple Developer Account** ($99/year)
   - Use EAS Build with proper code signing
   - Submit to TestFlight or App Store

2. **Third-party Signing Services**
   - Use services like AltStore, Sideloadly
   - Re-sign the IPA with your own certificate

3. **Jailbroken Device**
   - Install directly using tools like Filza

## 📦 What Gets Built

- **File Name**: `MavrixfyIpaExport.ipa`
- **Build Type**: Release (Optimized)
- **Code Signing**: None (Unsigned)
- **Architecture**: ARM64 (iOS devices)

## 🔧 Workflow Details

The workflow does the following:
1. Checks out the repository
2. Sets up Node.js and installs dependencies
3. Runs `expo prebuild` to generate native iOS project
4. Installs CocoaPods dependencies
5. Builds the app using Xcode without code signing
6. Packages the .app into .ipa format
7. Uploads as artifact and creates a release

## 🐛 Troubleshooting

### Build Fails at Prebuild
- Check if `app.json` is properly configured
- Ensure all dependencies are in `package.json`

### Build Fails at Pod Install
- CocoaPods dependencies might have issues
- Check the workflow logs for specific errors

### Build Fails at Xcode Build
- Native modules might need additional configuration
- Check if all required permissions are in `app.json`

## 📱 Alternative: Local Build

If you have a Mac, you can build locally:

```bash
# Generate iOS folder
npx expo prebuild --platform ios --clean

# Install pods
cd ios && pod install && cd ..

# Build with Xcode
cd ios
xcodebuild -workspace Mavrixfy.xcworkspace \
  -scheme Mavrixfy \
  -configuration Release \
  -sdk iphoneos \
  CODE_SIGNING_ALLOWED=NO \
  build

# Create IPA
cd build/Build/Products/Release-iphoneos
mkdir Payload
mv Mavrixfy.app Payload/
zip -r Mavrixfy.ipa Payload
```

## 📚 Resources

- [Expo Documentation](https://docs.expo.dev/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [GitHub Actions](https://docs.github.com/en/actions)
- [Xcode Build Settings](https://developer.apple.com/documentation/xcode)

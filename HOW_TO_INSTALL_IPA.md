# How to Install IPA on iPhone

## 📱 Current Issue Solution

If you downloaded the IPA and it shows as a ZIP file with a Payload folder inside:

### Quick Fix:
1. **Don't extract the ZIP** - The IPA file IS a ZIP file (that's normal)
2. **Rename the file** from `.zip` to `.ipa` if needed
3. **Use the file directly** in Scarlet/AltStore

### If You Already Extracted:
1. Go back to the Payload folder
2. You'll see `Mavrixfy.app` inside
3. **Re-zip the Payload folder**:
   - Select the `Payload` folder (not the .app inside)
   - Compress it
   - Rename the ZIP to `Mavrixfy.ipa`

## 🔧 Using Scarlet

### Method 1: Direct Import
1. Download IPA from GitHub Actions
2. **Save to Files app** (not extract)
3. Open **Scarlet**
4. Tap **"+"** or **Import**
5. Navigate to Files → Downloads
6. Select the **IPA file** (not extracted folder)
7. Tap **Install**

### Method 2: Share to Scarlet
1. In Files app, **long press** the IPA
2. Tap **Share**
3. Select **Scarlet**
4. Tap **Install**

## 🎯 Alternative: AltStore (More Reliable)

### Setup AltStore:
1. **On Computer**: Download AltServer from https://altstore.io
2. **Install AltServer** and run it
3. **Connect iPhone** via USB
4. **Trust computer** on iPhone
5. **Install AltStore** from AltServer menu

### Install IPA with AltStore:
1. **Transfer IPA** to iPhone (AirDrop, iCloud, etc.)
2. Open **AltStore** on iPhone
3. Tap **"My Apps"** tab
4. Tap **"+"** icon
5. Select your **IPA file**
6. Enter **Apple ID** credentials
7. Wait for installation

## 🚀 Alternative: Sideloadly (Easiest)

### Using Sideloadly:
1. **Download Sideloadly** from https://sideloadly.io
2. **Install on your computer** (Windows/Mac)
3. **Connect iPhone** via USB
4. **Open Sideloadly**
5. **Drag IPA file** into Sideloadly
6. **Enter Apple ID** (free account works)
7. **Click Start**
8. App installs in ~2 minutes

## ⚠️ Important Notes

### About Unsigned IPAs:
- **7-day limit**: Apps expire after 7 days (free Apple ID)
- **3-app limit**: Max 3 sideloaded apps at once
- **Re-sign needed**: Must reinstall every 7 days
- **No jailbreak needed**: Works on stock iOS

### With Apple Developer Account ($99/year):
- **365-day limit**: Apps last 1 year
- **No app limit**: Install unlimited apps
- **Proper signing**: More stable

## 🔄 Next Build (Fixed)

I've updated the workflow to provide a direct IPA file. Next time you run the build:
1. Go to GitHub Actions
2. Run "iOS-ipa-build" workflow
3. Download will be a proper IPA (no double compression)
4. Use directly in Scarlet/AltStore

## 📞 Troubleshooting

### "Unable to Install"
- Check iOS version compatibility
- Try different sideloading tool
- Verify IPA isn't corrupted (re-download)

### "Untrusted Developer"
- Go to Settings → General → VPN & Device Management
- Trust the developer profile
- Try opening the app again

### "App Crashes on Launch"
- The unsigned IPA might have issues
- Try using EAS Build with proper signing
- Or use a paid Apple Developer account

## 🎁 Recommended: Use EAS Build

For a properly signed IPA that installs easily:
1. Get Apple Developer account
2. Configure EAS Build
3. Build with proper code signing
4. Install via TestFlight or direct download

Would you like help setting up EAS Build for proper signing?

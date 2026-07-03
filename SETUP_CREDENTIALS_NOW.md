# ⚠️ URGENT: Setup iOS Credentials (One-Time)

## The Problem

Your GitHub Actions is failing with:
```
You're in non-interactive mode. EAS CLI couldn't find any credentials suitable for internal distribution.
```

**This means:** Expo has NO iOS credentials stored for your project yet.

Even for internal distribution, Expo needs to generate:
- iOS Distribution Certificate
- Push Notification Key
- Provisioning Profile

## ✅ Solution: Run ONE Build Locally

You only need to do this ONCE. After that, GitHub Actions will work automatically.

---

## Step-by-Step Instructions

### 1️⃣ Install EAS CLI (if not already installed)

```bash
npm install -g eas-cli
```

### 2️⃣ Login to Expo

```bash
eas login
```

Enter your credentials:
- Username: `satvik1234`
- Password: Your Expo password

### 3️⃣ Navigate to your app directory

```bash
cd e:\Mavrixfy\Mavrixfy_App
```

### 4️⃣ Run the build command (interactive mode)

```bash
eas build --platform ios --profile ios-unsigned
```

### 5️⃣ Follow the prompts

EAS will ask you several questions:

#### Question 1: "Generate a new Apple Distribution Certificate?"
**Answer:** `Y` (Yes)

EAS will automatically:
- Generate a Distribution Certificate
- Store it on Expo's servers
- Register it with Apple

#### Question 2: "Generate a new Apple Provisioning Profile?"
**Answer:** `Y` (Yes)

EAS will automatically:
- Create a Provisioning Profile
- Include your Apple Team ID
- Store it on Expo's servers

#### Question 3: "Generate a new Apple Push Notifications service key?"
**Answer:** `Y` (Yes) if you use push notifications

EAS will automatically create and store the key.

### 6️⃣ Wait for credential setup

EAS will:
- ✅ Generate all credentials
- ✅ Store them on Expo servers
- ✅ Link them to your project
- ✅ Start the build (or you can cancel if you just want credentials)

**You can cancel the build after credentials are set up!**
Press `Ctrl+C` once you see: "Build started..."

---

## What You Need

### Apple Developer Account Requirements:

✅ **Paid Apple Developer Account** ($99/year)
   - Sign up: https://developer.apple.com/programs/

✅ **Account must be in good standing**
   - No billing issues
   - Agreements accepted

✅ **App Bundle ID registered**
   - EAS will ask if you want to register it automatically
   - Or register manually at: https://developer.apple.com/account/resources/identifiers/list

---

## After Setup Completes

Once credentials are generated and stored:

1. ✅ **GitHub Actions will work automatically**
   - No more "credentials not found" errors
   - No need to re-run setup

2. ✅ **You can cancel the local build**
   - The credentials are already stored
   - Future builds will use them

3. ✅ **Test GitHub Actions**
   - Go to your repo's Actions tab
   - Run "iOS IPA Build" workflow
   - Select `ios-unsigned` profile
   - Should succeed now! 🎉

---

## Alternative: If You Don't Have Apple Developer Account Yet

If you don't have a paid Apple Developer account, you have two options:

### Option A: Get Apple Developer Account
- Sign up at: https://developer.apple.com/programs/
- Cost: $99/year
- Required for any iOS distribution (even internal)

### Option B: Use Simulator Build (Testing Only)
- Modify your workflow to use `ios-simulator` profile
- This builds for iOS Simulator only (no device testing)
- No Apple Developer account needed
- Not suitable for real device testing

To use simulator build, change your workflow input from `ios-unsigned` to `ios-simulator`.

---

## Troubleshooting

### Error: "Authentication required"
```bash
eas login
```
Make sure you're logged in with the same account as your `EXPO_TOKEN`.

### Error: "No bundle identifier found"
EAS will prompt you to create one. Answer `Y` to let it create automatically.

### Error: "Apple Developer account not found"
- Go to: https://developer.apple.com/account/
- Accept any pending agreements
- Make sure your account is active and paid

### Error: "Team ID not found"
- Your Apple account must be enrolled in the Developer Program
- Individual accounts and Company accounts both work
- Enterprise accounts work too (but cost $299/year)

---

## What Happens Behind the Scenes

When you run the interactive build:

```
eas build --platform ios --profile ios-unsigned
  ↓
EAS checks Expo servers for credentials
  ↓
No credentials found → Prompts you to generate
  ↓
You answer "Y" to prompts
  ↓
EAS generates:
  • Distribution Certificate + Private Key
  • Push Notification Key (if needed)
  • Provisioning Profile
  ↓
EAS stores them on Expo servers
  ↓
Future builds (including GitHub Actions) use stored credentials
  ↓
✅ No manual setup needed ever again!
```

---

## Quick Command Summary

```bash
# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# Navigate to project
cd e:\Mavrixfy\Mavrixfy_App

# Run interactive build (one-time setup)
eas build --platform ios --profile ios-unsigned

# Answer "Y" to all credential prompts

# Once you see "Build started..." you can press Ctrl+C to cancel
# (credentials are already saved at this point)
```

---

## After This One-Time Setup

Your GitHub Actions workflow will work because:
- ✅ Expo has your credentials stored
- ✅ `EXPO_TOKEN` gives GitHub Actions access to them
- ✅ EAS automatically uses stored credentials in non-interactive mode
- ✅ No more manual intervention needed!

---

## Expected Timeline

- **Credential generation**: 2-5 minutes
- **First build**: 10-20 minutes (optional - can cancel after credentials)
- **Future GitHub Actions builds**: Automatic! ✅

---

## Status Checklist

Before running GitHub Actions again, make sure:

- [ ] Apple Developer account active ($99/year)
- [ ] Logged into EAS CLI (`eas login`)
- [ ] Ran interactive build once (`eas build --platform ios --profile ios-unsigned`)
- [ ] Answered "Y" to credential generation prompts
- [ ] Credentials successfully created and stored
- [ ] `EXPO_TOKEN` added to GitHub Secrets

Once all checked, GitHub Actions will work! 🚀

---

**Need Help?**

If you encounter any issues during setup:
1. Check the error message carefully
2. Make sure your Apple Developer account is active
3. Verify you're logged into the correct Expo account
4. Check that your app's bundle identifier is unique

**Common Issue:** "Bundle identifier already exists"
- If you see this, it means the bundle ID is taken
- Update your `app.json` or `app.config.js` with a unique bundle ID
- Format: `com.yourcompany.yourappname` (must be globally unique)

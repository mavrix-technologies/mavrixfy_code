# ✅ Verify iOS Build Before Pushing (Windows Guide)

## Problem
Building iOS on GitHub Actions takes **20 minutes**. If it fails, you waste time.

## Solution: Verify Locally First (5 minutes)

Since you're on **Windows** (no Xcode), we verify the configuration instead of building.

## How to Verify on Windows

### Method 1: Run npm script (Easiest)

```powershell
npm run verify:ios
```

### Method 2: Run PowerShell script directly

```powershell
pwsh -File scripts/verify-ios-config.ps1
```

### Method 3: Run in PowerShell

```powershell
.\scripts\verify-ios-config.ps1
```

## What Gets Checked

The script verifies:

1. ✅ **Node.js** - Correct version installed
2. ✅ **Dependencies** - npm packages installed
3. ✅ **app.json** - iOS configuration valid
4. ✅ **package.json** - Required dependencies present
5. ✅ **expo prebuild** - Generates iOS project successfully
6. ✅ **iOS folder** - Xcode workspace created
7. ✅ **Podfile** - CocoaPods configuration exists
8. ✅ **GitHub workflow** - Properly configured

## Expected Output

```
🧪 iOS Build Configuration Verification
========================================

📦 Step 1: Checking Node.js...
✅ Node.js v22.x.x installed

📦 Step 2: Checking npm dependencies...
✅ node_modules exists

📋 Step 3: Validating app.json...
✅ app.json exists
   - Bundle ID: com.mavrixfy.app
   - Scheme: mavrixfy
   - Build Number: 31000

📋 Step 4: Checking package.json...
✅ Expo version: ~54.0.36
   ✅ react-native: 0.81.5
   ✅ expo-router: ~6.0.24
   ✅ react-native-track-player: ^4.1.2

🔨 Step 5: Testing expo prebuild...
✅ expo prebuild completed
✅ ios/ folder created
✅ Xcode workspace: Mavrixfy.xcworkspace
✅ Podfile exists

📋 Step 6: Validating GitHub workflow...
✅ ios-build.yml exists
✅ Uses macOS runner
✅ Configured for iOS Simulator
✅ Code signing disabled

========================================

🎉 All checks passed!

✅ Configuration looks good
✅ expo prebuild works
✅ iOS project generated

Next steps:
1. Commit and push your changes
2. Run 'iOS Build Validation' workflow on GitHub (fast, 5 min)
3. If validation passes, run full 'iOS Simulator Build' workflow
```

## If Errors Found

The script will show specific errors:

```
❌ Found 2 error(s)

Fix the errors above before pushing to GitHub
```

**Common fixes:**
- Missing dependencies → Run `npm install`
- Invalid app.json → Check JSON syntax
- expo prebuild fails → Check error message, might be dependency issue

## Workflow Recommendation

```powershell
# 1. Make your changes
git add .
git commit -m "Update iOS config"

# 2. Verify locally (5 minutes)
npm run verify:ios

# 3. If all checks pass, push
git push origin main

# 4. On GitHub: Run "iOS Build Validation" workflow (5 min)
#    If that passes → Run full "iOS Simulator Build" (20 min)
```

## What About the ios/ Folder?

The verification script creates an `ios/` folder to test `expo prebuild`.

**Is it gitignored?** Check your `.gitignore`:

```bash
# If ios/ is gitignored (common for Expo)
# No problem, it won't be committed

# If ios/ is NOT gitignored
# Delete it after verification:
Remove-Item -Recurse -Force ios
```

## Time Comparison

| Method | Time | Catches |
|--------|------|---------|
| Local verify | 5 min | Config errors, prebuild issues |
| GitHub validation | 5 min | + CocoaPods, xcodebuild dry-run |
| GitHub full build | 20 min | Actual compilation errors |

## When to Run Each

**Local verify (Windows):**
- ✅ After changing dependencies
- ✅ After modifying app.json
- ✅ Before every push

**GitHub validation:**
- ✅ After local verify passes
- ✅ To test CocoaPods installation
- ✅ To validate xcodebuild config

**GitHub full build:**
- ✅ After GitHub validation passes
- ✅ For releases
- ✅ When you need the actual IPA file

## Troubleshooting

### PowerShell execution policy error

```powershell
# Run this first (one-time)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### npm run verify:ios fails

```powershell
# Run script directly
pwsh -File scripts/verify-ios-config.ps1
```

### expo prebuild fails

Common causes:
- **Dependency conflict** → Check package.json versions
- **Cache issue** → Delete `node_modules` and run `npm install`
- **Invalid app.json** → Validate JSON syntax

### "ios folder already exists"

```powershell
# Clean up and try again
Remove-Item -Recurse -Force ios
npm run verify:ios
```

## Pro Tips

1. **Run verify before every push** - Saves 20 minutes
2. **Add to pre-commit hook** - Automatic verification
3. **Use GitHub validation** after local verify passes
4. **Only run full build** when you need the IPA

## Example Workflow

```powershell
# Day 1: Working on features
npm run verify:ios        # Quick local check
git push                  # Push if verify passes

# Day 2: Ready for testing
# Go to GitHub Actions
# Run "iOS Build Validation" (5 min)
# If passes → Run "iOS Simulator Build" (20 min)
# Download IPA for testing
```

---

**Summary:**
- ✅ Run `npm run verify:ios` before pushing (5 min)
- ✅ If passes → Push to GitHub
- ✅ Run validation workflow (5 min)
- ✅ If passes → Run full build (20 min)
- ✅ Download IPA

This workflow saves you from wasting 20 minutes on failed builds!

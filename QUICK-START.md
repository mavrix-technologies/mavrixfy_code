# 🚀 iOS Build Quick Start (Windows)

## One Command to Verify Everything

```powershell
npm run verify:ios
```

**Takes:** ~5 minutes  
**Checks:** Everything except the actual build  
**Saves:** 15-20 minutes if something is wrong

---

## Full Workflow

### Step 1: Work Locally (Windows)
```powershell
# Make changes to your code
git add .
git commit -m "Your changes"
```

### Step 2: Verify Before Push (5 min)
```powershell
npm run verify:ios
```

**If you see 🎉 All checks passed!** → Continue to Step 3  
**If you see ❌ errors** → Fix them first

### Step 3: Push to GitHub
```powershell
git push origin main
```

### Step 4: GitHub Validation (5 min)
1. Go to **Actions** tab on GitHub
2. Select **"iOS Build Validation (Fast)"**
3. Click **"Run workflow"**
4. Wait ~5 minutes

**If ✅ validation passes** → Continue to Step 5  
**If ❌ validation fails** → Check logs, fix issues

### Step 5: Full Build (20 min)
1. Go to **Actions** tab
2. Select **"iOS Simulator Build (Unsigned)"**
3. Click **"Run workflow"**
4. Wait ~20 minutes

**If ✅ build succeeds** → Download IPA!  
**If ❌ build fails** → Download build logs

### Step 6: Download IPA
- **From Artifacts:** Scroll down → Download `Mavrixfy-iOS-Simulator-IPA`
- **From Releases:** Go to Releases → Download latest IPA

---

## Quick Commands Reference

```powershell
# Verify iOS configuration (Windows)
npm run verify:ios

# Install dependencies
npm install

# Clean and reinstall
Remove-Item -Recurse -Force node_modules
npm install

# Test expo prebuild
npx expo prebuild --platform ios --clean

# Clean iOS folder (if needed)
Remove-Item -Recurse -Force ios
```

---

## What Each Step Does

| Step | What Runs | Time | Where |
|------|-----------|------|-------|
| 1. Local verify | Config checks | 5 min | Your PC (Windows) |
| 2. GitHub validation | + CocoaPods + xcodebuild dry-run | 5 min | GitHub Actions |
| 3. GitHub build | Full xcodebuild compile | 20 min | GitHub Actions |

---

## When Something Fails

### Local verify fails
1. Read the error message (they're specific)
2. Fix the issue (usually dependencies or app.json)
3. Run `npm run verify:ios` again

### GitHub validation fails
1. Click on the failed step in Actions
2. Read the error (usually CocoaPods or workspace issue)
3. Fix and push again

### GitHub build fails
1. Download the `build-logs` artifact
2. Open `build.log` and search for errors
3. Look for compilation errors (not warnings)
4. Fix and push again

---

## Common Issues & Fixes

### "expo prebuild failed"
```powershell
# Clear cache and try again
Remove-Item -Recurse -Force node_modules
Remove-Item -Recurse -Force ios
npm install
npm run verify:ios
```

### "Cannot find module"
```powershell
npm install
```

### "Invalid JSON in app.json"
- Open `app.json`
- Validate JSON syntax (use a JSON validator)
- Fix and try again

### "Scheme not found"
- Check `app.json` → `expo.ios.scheme`
- Should match workspace scheme name

---

## Pro Tips

✅ **Always verify locally first** - Catches 90% of issues in 5 min  
✅ **Use validation workflow** - Catches remaining 9% in 5 min  
✅ **Only run full build** - When you know it will work  
✅ **Download logs if build fails** - Contains exact error messages  

---

## Need Help?

1. Check `iOS-BUILD-TESTING.md` - Detailed guide
2. Check `VERIFY-BEFORE-PUSH.md` - Windows verification guide
3. Check GitHub Actions logs - Specific error messages

---

## Summary: The Fast Path

```
1. npm run verify:ios (5 min, Windows)
   ✅ Passes → Push to GitHub

2. Run "iOS Build Validation" (5 min, GitHub)
   ✅ Passes → Run full build

3. Run "iOS Simulator Build" (20 min, GitHub)
   ✅ Succeeds → Download IPA!
```

**Total time if all passes: ~30 minutes**  
**Time saved by verifying first: Potentially hours of failed builds**

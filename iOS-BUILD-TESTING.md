# iOS Build Testing Guide

## Problem: Build Takes Too Long to Test

Building iOS in GitHub Actions takes **15-20 minutes**. If it fails, you waste time and CI minutes.

## Solutions: Test Before Pushing

### Option 1: Quick Validation Workflow (5 minutes) ⚡

Run the **validation-only workflow** to check if your build will work:

1. Go to **Actions** tab
2. Select **"iOS Build Validation (Fast)"**
3. Click **"Run workflow"**
4. Wait ~5 minutes (much faster!)

**What it checks:**
- ✅ Dependencies install correctly
- ✅ `expo prebuild` works
- ✅ CocoaPods installs
- ✅ Workspace and scheme exist
- ✅ xcodebuild dry-run passes

**If validation passes** → Full build should work!

### Option 2: Local Testing Script (If you have macOS)

Run the test script locally before committing:

```bash
# Make script executable (first time only)
chmod +x scripts/test-ios-build-local.sh

# Run the test
./scripts/test-ios-build-local.sh
```

**What it does:**
- Checks your environment
- Runs `expo prebuild`
- Installs CocoaPods
- Tests xcodebuild with dry-run
- Completes in ~5 minutes

**If test passes** → You can safely commit and push!

### Option 3: Use Pull Requests

The validation workflow automatically runs on PRs that change iOS files:

1. Create a new branch
2. Make your changes
3. Open a Pull Request
4. Validation runs automatically
5. If green → merge and full build will work

## Recommended Workflow

```bash
# 1. Make your changes
git add .
git commit -m "Update iOS build config"

# 2. Test locally (if on macOS)
./scripts/test-ios-build-local.sh

# OR: Push to a branch and check validation
git push origin your-branch-name
# → Check "iOS Build Validation" in Actions tab

# 3. If validation passes, push to main
git push origin main
# → Full build runs and creates IPA
```

## Understanding the Build Steps

### Fast Validation (~5 min)
1. ✅ Setup environment (2 min)
2. ✅ Install dependencies (1 min)
3. ✅ Prebuild iOS (1 min)
4. ✅ Validate config (1 min)

### Full Build (~20 min)
1. ✅ Setup environment (2 min)
2. ✅ Install dependencies (1 min)
3. ✅ Prebuild iOS (1 min)
4. ✅ Install CocoaPods (2 min)
5. ⏳ **Build with xcodebuild (15 min)** ← This is slow
6. ✅ Create IPA (1 min)
7. ✅ Upload artifacts (1 min)

## Checking Build Logs

If a build fails, check the logs:

### View in GitHub Actions UI
1. Go to failed workflow run
2. Click on failed step (usually "Build iOS Simulator app")
3. Expand to see error messages

### Download Full Logs
1. Scroll to "Artifacts" section
2. Download `build-logs` (only appears on failure)
3. Extract and read `build.log`

### Common Errors and Solutions

#### Error: "Scheme 'Mavrixfy' not found"
**Solution:** Run validation workflow to check scheme name

#### Error: "No such file or directory: ios/Mavrixfy.xcworkspace"
**Solution:** Check if `expo prebuild` completed successfully

#### Error: CocoaPods installation fails
**Solution:** Check `Podfile` for syntax errors or version conflicts

#### Error: xcodebuild compilation errors
**Solution:**
1. Download `build-logs` artifact
2. Look for actual compilation errors (not warnings)
3. Check if new dependencies broke something
4. Test locally if possible

## CI/CD Best Practices

### Save CI Minutes
1. ✅ Use validation workflow first
2. ✅ Test locally before pushing (if on macOS)
3. ✅ Don't commit to main directly
4. ✅ Use branches and PRs

### When to Run Full Build
- ✅ After validation passes
- ✅ For releases/tags
- ✅ Weekly scheduled builds (to catch dependency issues)
- ❌ Not for every commit (too slow)

### Workflow Triggers

**Validation Workflow (Fast):**
- Manual trigger only
- Auto-runs on PRs that touch iOS files

**Full Build Workflow:**
- Manual trigger
- Push to main/master branches
- Can be disabled if needed

## Disabling Auto-Builds

If builds are running too often:

Edit `.github/workflows/ios-build.yml`:

```yaml
# Change this:
on:
  workflow_dispatch:
  push:
    branches:
      - main

# To this (manual only):
on:
  workflow_dispatch:
```

## Quick Reference

| Task | Time | Command |
|------|------|---------|
| Validation (GitHub) | ~5 min | Actions → iOS Build Validation → Run |
| Local test | ~5 min | `./scripts/test-ios-build-local.sh` |
| Full build | ~20 min | Actions → iOS Simulator Build → Run |
| Check logs | <1 min | Failed run → Download build-logs |

## Tips

1. **Always validate first** before running full build
2. **Use PRs** to auto-validate changes
3. **Download logs** if validation or build fails
4. **Test locally** if you have macOS with Xcode
5. **Disable auto-builds** if you don't need them on every push

---

**Need Help?**
- Check validation workflow output first
- Download and read build logs
- Run local test script for faster debugging

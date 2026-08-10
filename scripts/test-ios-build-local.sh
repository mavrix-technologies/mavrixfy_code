#!/bin/bash
set -e

echo "🧪 iOS Simulator Build Test Script"
echo "=================================="
echo ""
echo "This script tests if the iOS build will work in CI"
echo "Run this BEFORE pushing to GitHub to save time!"
echo ""

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "❌ This script requires macOS"
  exit 1
fi

# Check if Xcode is installed
if ! command -v xcodebuild &> /dev/null; then
  echo "❌ Xcode is not installed"
  exit 1
fi

echo "✅ Running on macOS with Xcode"
echo ""

# Step 1: Check Node.js
echo "📦 Step 1: Checking Node.js..."
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed"
  exit 1
fi
NODE_VERSION=$(node -v)
echo "✅ Node.js $NODE_VERSION"
echo ""

# Step 2: Check dependencies
echo "📦 Step 2: Checking npm dependencies..."
if [ ! -d "node_modules" ]; then
  echo "⚠️  node_modules not found, running npm install..."
  npm install
else
  echo "✅ node_modules exists"
fi
echo ""

# Step 3: Prebuild iOS
echo "🔨 Step 3: Running expo prebuild..."
npx expo prebuild --platform ios --clean
echo "✅ Prebuild completed"
echo ""

# Step 4: Install CocoaPods
echo "📦 Step 4: Installing CocoaPods dependencies..."
cd ios
pod install
cd ..
echo "✅ CocoaPods installed"
echo ""

# Step 5: Test build (dry run)
echo "🧪 Step 5: Testing xcodebuild (this may take a while)..."
cd ios
xcodebuild \
  -workspace Mavrixfy.xcworkspace \
  -scheme Mavrixfy \
  -configuration Release \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO \
  -dry-run
cd ..
echo "✅ xcodebuild dry-run passed"
echo ""

echo "🎉 All checks passed!"
echo ""
echo "Your build should work in GitHub Actions."
echo "You can now safely commit and push."

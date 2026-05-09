#!/usr/bin/env bash

# EAS Build Pre-Install Hook
# This script runs before npm install during EAS builds
# It fixes the build.gradle to use the correct version code resolution

echo "🔧 Fixing build.gradle for EAS build..."

BUILD_GRADLE_PATH="android/app/build.gradle"

if [ -f "$BUILD_GRADLE_PATH" ]; then
  echo "✅ Found build.gradle at $BUILD_GRADLE_PATH"
  
  # Replace the version code resolution logic
  sed -i 's|file("\$projectDir/../../app.json")|file("\$projectRoot/app.json")|g' "$BUILD_GRADLE_PATH"
  
  echo "✅ Fixed build.gradle version code resolution"
else
  echo "⚠️  build.gradle not found at $BUILD_GRADLE_PATH"
fi

echo "✅ Pre-install hook completed"

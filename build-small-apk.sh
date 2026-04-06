#!/bin/bash

# Build Small APK for armeabi-v7a Architecture
# This script builds a smaller APK optimized for 32-bit ARM devices

set -e

echo "🚀 Building Mavrixfy APK for armeabi-v7a (32-bit ARM)"
echo "=================================================="
echo ""

# Check if we're in the right directory
if [ ! -f "app.json" ]; then
    echo "❌ Error: app.json not found. Please run this script from the Mavrixfy_App directory."
    exit 1
fi

# Check if EAS CLI is installed
if ! command -v eas &> /dev/null; then
    echo "📦 EAS CLI not found. Installing..."
    npm install -g eas-cli
fi

# Login to EAS (if not already logged in)
echo "🔐 Checking EAS authentication..."
eas whoami || eas login

echo ""
echo "📋 Build Options:"
echo "1. Cloud Build (EAS servers - slower but no local setup needed)"
echo "2. Local Build (faster but requires Android SDK)"
echo ""
read -p "Choose build option (1 or 2): " build_option

if [ "$build_option" = "1" ]; then
    echo ""
    echo "☁️  Starting cloud build..."
    echo "This will take 10-20 minutes. You can close this terminal."
    echo ""
    eas build --profile production-armeabi-v7a --platform android
    
elif [ "$build_option" = "2" ]; then
    echo ""
    echo "💻 Starting local build..."
    echo "This requires Android SDK to be installed."
    echo ""
    
    # Check if Android SDK is available
    if [ -z "$ANDROID_HOME" ]; then
        echo "⚠️  Warning: ANDROID_HOME not set. Local build may fail."
        echo "Please install Android SDK and set ANDROID_HOME environment variable."
        read -p "Continue anyway? (y/n): " continue_build
        if [ "$continue_build" != "y" ]; then
            exit 1
        fi
    fi
    
    eas build --profile production-armeabi-v7a --platform android --local
    
else
    echo "❌ Invalid option. Please choose 1 or 2."
    exit 1
fi

echo ""
echo "✅ Build completed!"
echo ""
echo "📱 Next steps:"
echo "1. Download the APK from EAS dashboard: https://expo.dev/accounts/satvik1234/projects/mavrixfy/builds"
echo "2. Install on your device: adb install app-armeabi-v7a-release.apk"
echo "3. Test thoroughly before distributing"
echo ""
echo "📊 Expected APK size: 25-35 MB (vs 80-120 MB for universal build)"
echo ""

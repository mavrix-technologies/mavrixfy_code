#!/bin/bash

# Android Auto Testing Script for Mavrixfy
# This script helps verify all critical Android Auto functionality

set -e

echo "🚗 Mavrixfy Android Auto Testing Script"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if device is connected
if ! adb devices | grep -q "device$"; then
    echo -e "${RED}❌ No Android device connected${NC}"
    echo "Please connect your device via USB and enable USB debugging"
    exit 1
fi

echo -e "${GREEN}✅ Device connected${NC}"
echo ""

# Function to check if app is installed
check_app_installed() {
    if adb shell pm list packages | grep -q "com.mavrixfy.app"; then
        echo -e "${GREEN}✅ Mavrixfy app is installed${NC}"
        return 0
    else
        echo -e "${RED}❌ Mavrixfy app is not installed${NC}"
        return 1
    fi
}

# Function to check if service is running
check_service_running() {
    local service_name=$1
    if adb shell dumpsys activity services | grep -q "$service_name"; then
        echo -e "${GREEN}✅ $service_name is running${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  $service_name is not running${NC}"
        return 1
    fi
}

# Function to check MediaSession
check_media_session() {
    echo ""
    echo "📱 Checking MediaSession state..."
    adb shell dumpsys media_session | grep -A 20 "Mavrixfy" || echo -e "${YELLOW}⚠️  No active MediaSession found${NC}"
}

# Function to show logs
show_logs() {
    echo ""
    echo "📋 Recent logs (last 50 lines):"
    echo "================================"
    adb logcat -d | grep -E "MavrixfyAuto|TrackPlayer" | tail -50
}

# Main testing flow
echo "1️⃣  Checking app installation..."
check_app_installed || exit 1

echo ""
echo "2️⃣  Checking services..."
check_service_running "MavrixfyAutoService"
check_service_running "MusicService"

echo ""
echo "3️⃣  Checking MediaSession..."
check_media_session

echo ""
echo "4️⃣  Testing stopWithApp configuration..."
echo "   Please follow these steps:"
echo "   1. Open Mavrixfy app"
echo "   2. Start playing a song"
echo "   3. Close the app completely (swipe from recents)"
echo "   4. Check if music continues playing"
echo ""
read -p "   Does music continue playing after closing app? (y/n): " continues
if [ "$continues" = "y" ]; then
    echo -e "${GREEN}   ✅ Background playback works!${NC}"
else
    echo -e "${RED}   ❌ Background playback NOT working${NC}"
    echo -e "${YELLOW}   Check if stopWithApp: false is set in lib/trackPlayer.ts${NC}"
fi

echo ""
echo "5️⃣  Testing Android Auto connection..."
echo "   Please follow these steps:"
echo "   1. Open Android Auto app on phone"
echo "   2. Or connect to car via USB"
echo "   3. Navigate to Mavrixfy in Android Auto"
echo ""
read -p "   Can you see Mavrixfy in Android Auto? (y/n): " visible
if [ "$visible" = "y" ]; then
    echo -e "${GREEN}   ✅ Android Auto integration visible!${NC}"
else
    echo -e "${RED}   ❌ Android Auto integration NOT visible${NC}"
    echo -e "${YELLOW}   Check MavrixfyAutoService in manifest${NC}"
fi

echo ""
echo "6️⃣  Testing metadata updates..."
echo "   Please follow these steps:"
echo "   1. Play a song in Android Auto"
echo "   2. Skip to next song"
echo "   3. Check if artwork and title update"
echo ""
read -p "   Does artwork update when skipping songs? (y/n): " artwork
if [ "$artwork" = "y" ]; then
    echo -e "${GREEN}   ✅ Metadata updates work!${NC}"
else
    echo -e "${RED}   ❌ Metadata updates NOT working${NC}"
    echo -e "${YELLOW}   Check onMetadataChanged in MavrixfyAutoService.kt${NC}"
fi

echo ""
echo "7️⃣  Testing progress bar..."
echo "   Please follow these steps:"
echo "   1. Play a song in Android Auto"
echo "   2. Watch the progress bar"
echo ""
read -p "   Does the progress bar move smoothly? (y/n): " progress
if [ "$progress" = "y" ]; then
    echo -e "${GREEN}   ✅ Progress updates work!${NC}"
else
    echo -e "${RED}   ❌ Progress updates NOT working${NC}"
    echo -e "${YELLOW}   Check progressUpdateEventInterval in lib/trackPlayer.ts${NC}"
fi

echo ""
echo "8️⃣  Testing audio focus..."
echo "   Please follow these steps:"
echo "   1. Play music in Android Auto"
echo "   2. Start Google Maps navigation"
echo "   3. Check if music ducks/pauses during navigation voice"
echo ""
read -p "   Does music pause/duck for navigation? (y/n): " focus
if [ "$focus" = "y" ]; then
    echo -e "${GREEN}   ✅ Audio focus handling works!${NC}"
else
    echo -e "${RED}   ❌ Audio focus handling NOT working${NC}"
    echo -e "${YELLOW}   Check Event.RemoteDuck listener in lib/trackPlayerService.ts${NC}"
fi

echo ""
echo "9️⃣  Collecting diagnostic logs..."
show_logs

echo ""
echo "🔟  Testing complete!"
echo "===================="
echo ""
echo "📊 Summary:"
echo "   - App installed: ✅"
echo "   - Background playback: $([ "$continues" = "y" ] && echo "✅" || echo "❌")"
echo "   - Android Auto visible: $([ "$visible" = "y" ] && echo "✅" || echo "❌")"
echo "   - Metadata updates: $([ "$artwork" = "y" ] && echo "✅" || echo "❌")"
echo "   - Progress bar: $([ "$progress" = "y" ] && echo "✅" || echo "❌")"
echo "   - Audio focus: $([ "$focus" = "y" ] && echo "✅" || echo "❌")"
echo ""

# Calculate pass rate
total=5
passed=0
[ "$continues" = "y" ] && ((passed++))
[ "$visible" = "y" ] && ((passed++))
[ "$artwork" = "y" ] && ((passed++))
[ "$progress" = "y" ] && ((passed++))
[ "$focus" = "y" ] && ((passed++))

echo "Pass rate: $passed/$total ($(( passed * 100 / total ))%)"
echo ""

if [ $passed -eq $total ]; then
    echo -e "${GREEN}🎉 All tests passed! Ready for Google Play submission!${NC}"
else
    echo -e "${YELLOW}⚠️  Some tests failed. Review ANDROID_AUTO_FIXES.md for solutions.${NC}"
fi

echo ""
echo "📚 For detailed testing checklist, see: ANDROID_AUTO_CHECKLIST.md"
echo "🔧 For fix explanations, see: ANDROID_AUTO_FIXES.md"
echo ""
echo "💡 Tip: Run 'adb logcat | grep -E \"MavrixfyAuto|TrackPlayer\"' to see live logs"
echo ""

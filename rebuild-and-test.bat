@echo off
echo ========================================
echo  Rebuild Mavrixfy with Android Auto
echo ========================================
echo.

set ADB="%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"

echo [1/4] Cleaning previous build...
cd android
call gradlew.bat clean
echo.

echo [2/4] Building APK...
call gradlew.bat assembleDebug
if errorlevel 1 (
    echo [ERROR] Build failed!
    pause
    exit /b 1
)
echo [OK] Build successful
echo.

echo [3/4] Installing on device...
%ADB% install -r app\build\outputs\apk\debug\app-debug.apk
if errorlevel 1 (
    echo [ERROR] Installation failed!
    pause
    exit /b 1
)
echo [OK] App installed
echo.

echo [4/4] Checking services...
%ADB% shell dumpsys package com.mavrixfy.app | findstr "Service"
echo.

echo ========================================
echo  Next Steps:
echo ========================================
echo 1. Open Mavrixfy app and play a song
echo 2. Run: .\start-android-auto.bat
echo 3. In DHU, tap media icon and look for Mavrixfy
echo ========================================
pause

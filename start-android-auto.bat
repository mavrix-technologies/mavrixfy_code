@echo off
echo ========================================
echo  Android Auto Setup
echo ========================================
echo.

REM Set ADB path
set ADB="%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"

REM Check if ADB exists
if not exist %ADB% (
    echo [ERROR] ADB not found at: %ADB%
    echo Please make sure Android SDK is installed
    pause
    exit /b 1
)

REM Check if device is connected
echo [1/5] Checking device connection...
%ADB% devices | findstr "device$" >nul
if errorlevel 1 (
    echo [ERROR] No Android device connected!
    echo Please connect your phone via USB and enable USB debugging.
    pause
    exit /b 1
)
echo [OK] Device connected
echo.

REM Check if app is installed
echo [2/5] Checking if app is installed...
%ADB% shell pm list packages | findstr "com.mavrixfy.app" >nul
if errorlevel 1 (
    echo [ERROR] Mavrixfy app not installed!
    echo Please install the app first:
    echo   cd android
    echo   gradlew.bat assembleDebug
    echo   adb install -r app\build\outputs\apk\debug\app-debug.apk
    pause
    exit /b 1
)
echo [OK] App is installed
echo.

REM Kill any existing adb forwarding
echo [3/5] Setting up ADB forwarding...
%ADB% forward --remove tcp:5277 >nul 2>&1
%ADB% forward tcp:5277 tcp:5277
if errorlevel 1 (
    echo [ERROR] Failed to set up ADB forwarding
    pause
    exit /b 1
)
echo [OK] Port forwarding: tcp:5277 -^> tcp:5277
echo.

REM Start the Head Unit Server on device
echo [4/5] Starting Head Unit Server on device...
echo Attempting to start Android Auto Head Unit Server...
%ADB% shell am start-foreground-service -a com.google.android.gms.car.service.START com.google.android.projection.gearhead/.HeadUnitService
if errorlevel 1 (
    echo [WARNING] Could not start Head Unit Server
    echo Make sure Android Auto app is installed and updated on your device
    echo Install from: https://play.google.com/store/apps/details?id=com.google.android.projection.gearhead
    echo.
    echo If Android Auto is installed but won't start, try:
    echo 1. Open Android Auto app on your phone
    echo 2. Complete the initial setup
    echo 3. Enable Developer mode: Tap version number 10 times in About section
    echo 4. Go to Developer settings and enable "Unknown sources"
    echo 5. Re-run this script
)
timeout /t 3 >nul
echo [OK] Server start attempted
echo.

REM Check if DHU exists
echo [5/5] Starting Desktop Head Unit...
if not exist "%LOCALAPPDATA%\Android\Sdk\extras\google\auto\desktop-head-unit.exe" (
    echo [ERROR] Desktop Head Unit not found!
    echo.
    echo To install DHU:
    echo 1. Open Android Studio
    echo 2. Go to Tools ^> SDK Manager
    echo 3. Go to SDK Tools tab
    echo 4. Check "Android Auto Desktop Head Unit Emulator"
    echo 5. Click Apply to install
    echo.
    pause
    exit /b 1
)

echo [OK] Launching DHU...
echo.
echo ========================================
echo  Instructions:
echo ========================================
echo 1. DHU window will open
echo 2. On your phone, tap "Accept" when connection prompt appears
echo 3. In DHU, tap the media icon (music note)
echo 4. Select Mavrixfy from the app list
echo 5. Play a song in your app
echo 6. Controls should appear in DHU
echo.
echo Press Ctrl+C to stop DHU
echo ========================================
echo.

"%LOCALAPPDATA%\Android\Sdk\extras\google\auto\desktop-head-unit.exe"

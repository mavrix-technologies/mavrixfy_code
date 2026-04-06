@echo off
REM Build Small APK for armeabi-v7a Architecture
REM This script builds a smaller APK optimized for 32-bit ARM devices

echo.
echo 🚀 Building Mavrixfy APK for armeabi-v7a (32-bit ARM)
echo ==================================================
echo.

REM Check if we're in the right directory
if not exist "app.json" (
    echo ❌ Error: app.json not found. Please run this script from the Mavrixfy_App directory.
    exit /b 1
)

REM Check if EAS CLI is installed
where eas >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo 📦 EAS CLI not found. Installing...
    call npm install -g eas-cli
)

REM Login to EAS (if not already logged in)
echo 🔐 Checking EAS authentication...
call eas whoami
if %ERRORLEVEL% NEQ 0 (
    call eas login
)

echo.
echo 📋 Build Options:
echo 1. Cloud Build (EAS servers - slower but no local setup needed)
echo 2. Local Build (faster but requires Android SDK)
echo.
set /p build_option="Choose build option (1 or 2): "

if "%build_option%"=="1" (
    echo.
    echo ☁️  Starting cloud build...
    echo This will take 10-20 minutes. You can close this terminal.
    echo.
    call eas build --profile production-armeabi-v7a --platform android
    
) else if "%build_option%"=="2" (
    echo.
    echo 💻 Starting local build...
    echo This requires Android SDK to be installed.
    echo.
    
    REM Check if Android SDK is available
    if "%ANDROID_HOME%"=="" (
        echo ⚠️  Warning: ANDROID_HOME not set. Local build may fail.
        echo Please install Android SDK and set ANDROID_HOME environment variable.
        set /p continue_build="Continue anyway? (y/n): "
        if not "!continue_build!"=="y" (
            exit /b 1
        )
    )
    
    call eas build --profile production-armeabi-v7a --platform android --local
    
) else (
    echo ❌ Invalid option. Please choose 1 or 2.
    exit /b 1
)

echo.
echo ✅ Build completed!
echo.
echo 📱 Next steps:
echo 1. Download the APK from EAS dashboard: https://expo.dev/accounts/satvik1234/projects/mavrixfy/builds
echo 2. Install on your device: adb install app-armeabi-v7a-release.apk
echo 3. Test thoroughly before distributing
echo.
echo 📊 Expected APK size: 25-35 MB (vs 80-120 MB for universal build)
echo.
pause

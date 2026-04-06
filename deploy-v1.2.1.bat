@echo off
REM Mavrixfy v1.2.1 Deployment Script for Windows
REM This script automates the deployment process

echo.
echo ========================================
echo   Mavrixfy v1.2.1 Deployment
echo ========================================
echo.

REM Step 1: Verify directory
echo Step 1: Verifying directory...
if not exist "app.json" (
    echo Error: app.json not found. Please run this script from Mavrixfy_App directory
    pause
    exit /b 1
)
echo [OK] Directory verified
echo.

REM Step 2: Check git status
echo Step 2: Checking git status...
git status -s > nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Git repository detected
) else (
    echo [WARNING] Not a git repository
)
echo.

REM Step 3: Commit changes
echo Step 3: Committing changes...
set /p commit="Do you want to commit changes? (y/n): "
if /i "%commit%"=="y" (
    git add .
    git commit -m "Release v1.2.1: Performance improvements and optimizations"
    echo [OK] Changes committed
) else (
    echo [SKIP] Commit skipped
)
echo.

REM Step 4: Push to repository
echo Step 4: Pushing to repository...
set /p push="Push to remote repository? (y/n): "
if /i "%push%"=="y" (
    git push origin main
    echo [OK] Pushed to repository
) else (
    echo [SKIP] Push skipped
)
echo.

REM Step 5: Build with EAS
echo Step 5: Building APK with EAS...
set /p build="Start EAS build? (y/n): "
if /i "%build%"=="y" (
    echo Building production APK (armeabi-v7a)...
    call eas build --platform android --profile production-armeabi-v7a
    echo [OK] Build started
) else (
    echo [SKIP] EAS build skipped
)
echo.

REM Step 6: Publish OTA Update
echo Step 6: Publishing OTA update...
set /p ota="Publish OTA update? (y/n): "
if /i "%ota%"=="y" (
    call eas update --branch production --message "v1.2.1: Performance improvements and bug fixes"
    echo [OK] OTA update published
) else (
    echo [SKIP] OTA update skipped
)
echo.

REM Step 7: Deploy backend
echo Step 7: Deploying backend...
set /p backend="Deploy backend to Vercel? (y/n): "
if /i "%backend%"=="y" (
    cd ..\Mavrixfy-web\backend
    git add app-version.json src\controllers\app.controller.js
    git commit -m "Update version to 1.2.1"
    git push origin main
    echo [OK] Backend deployed (Vercel will auto-deploy)
    cd ..\..\Mavrixfy_App
) else (
    echo [SKIP] Backend deployment skipped
)
echo.

REM Summary
echo ========================================
echo   Deployment Process Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Monitor EAS build progress: https://expo.dev
echo 2. Check Vercel deployment: https://vercel.com
echo 3. Test version endpoint: curl https://spotify-api-drab.vercel.app/api/app-message
echo 4. Verify update notification in app
echo.
echo Documentation:
echo - Release Notes: RELEASE_NOTES_v1.2.1.md
echo - Deployment Guide: DEPLOYMENT_GUIDE_v1.2.1.md
echo - Update Summary: UPDATE_SUMMARY_v1.2.1.md
echo.
echo Version 1.2.1 is ready!
echo.
pause

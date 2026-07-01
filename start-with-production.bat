@echo off
echo ========================================
echo   Starting Mavrixfy App
echo   Backend: Production (Vercel)
echo ========================================
echo.

echo Current configuration:
echo   URL: https://mavrixfy-api-drab.vercel.app/api/youtube-music
echo.

echo [1/2] Testing connection to production backend...
echo.
node test-youtube-connection.js

if %errorlevel% neq 0 (
    echo.
    echo WARNING: Backend connection test failed!
    echo The app may not work correctly.
    echo.
    echo Press any key to continue anyway, or Ctrl+C to cancel...
    pause >nul
)

echo.
echo [2/2] Starting Expo development server...
echo.
echo NOTE: This will open in your browser and show a QR code.
echo Scan the QR code with Expo Go app on your phone.
echo.
pause

npx expo start --clear

pause

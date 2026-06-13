@echo off
echo.
echo ========================================
echo  Restarting App with Cache Clear
echo ========================================
echo.
echo This will:
echo 1. Clear Metro bundler cache
echo 2. Restart Expo with new .env settings
echo.
echo Press Ctrl+C to cancel, or
pause

echo.
echo Clearing cache and starting...
npx expo start --clear

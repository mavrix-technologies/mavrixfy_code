@echo off
echo ========================================
echo Restarting Expo with Cache Clear
echo ========================================
echo.
echo This will restart Expo and clear the cache
echo to load the new YouTube Music API URL
echo.
echo New API URL: http://192.168.1.11:8000
echo.
pause

echo.
echo Clearing Expo cache and restarting...
echo.

npx expo start -c


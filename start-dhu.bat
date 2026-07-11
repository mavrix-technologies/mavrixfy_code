@echo off
echo ========================================
echo   Mavrixfy - Android Auto DHU Launcher
echo ========================================
echo.
echo [1/4] Checking ADB connection...
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" devices
echo.
echo [2/4] Setting up port forwarding...
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" forward tcp:5277 tcp:5277
echo Port forwarding: tcp:5277 -^> tcp:5277 OK
echo.
echo [3/4] MANUAL STEP REQUIRED:
echo ========================================
echo ON YOUR PHONE:
echo 1. Open Android Auto app
echo 2. Tap menu (three lines) -^> Settings
echo 3. Scroll down and tap "About"
echo 4. Tap "Version" 10 TIMES (enable developer mode)
echo 5. Go back -^> Developer settings
echo 6. Enable "Unknown sources"
echo 7. Scroll down and tap "Start head unit server"
echo ========================================
echo.
echo Press any key AFTER you start the Head Unit Server on your phone...
pause >nul
echo.
echo [4/4] Starting DHU on PC...
echo.
echo DHU Window will open. Keep this terminal running!
echo Press Ctrl+C here to stop DHU when done.
echo ========================================
echo.
"%LOCALAPPDATA%\Android\Sdk\extras\google\auto\desktop-head-unit.exe"

@echo off
echo ========================================
echo  Android Auto DHU - Simple Start
echo ========================================
echo.

set ADB="%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
set DHU="%LOCALAPPDATA%\Android\Sdk\extras\google\auto\desktop-head-unit.exe"

REM Step 1: Check device
echo [1/5] Checking device connection...
%ADB% devices | findstr "device$" >nul
if errorlevel 1 (
    echo [ERROR] No device connected!
    echo.
    echo Please:
    echo 1. Connect phone via USB
    echo 2. Enable USB Debugging on phone
    echo 3. Allow USB debugging when prompted
    echo.
    pause
    exit /b 1
)
echo [OK] Device connected
echo.

REM Step 2: Kill any existing ADB server
echo [2/5] Restarting ADB server...
%ADB% kill-server >nul 2>&1
timeout /t 1 /nobreak >nul
%ADB% start-server >nul 2>&1
timeout /t 2 /nobreak >nul
echo [OK] ADB server ready
echo.

REM Step 3: Setup port forwarding
echo [3/5] Setting up port forwarding...
%ADB% forward --remove-all >nul 2>&1
%ADB% forward tcp:5277 tcp:5277
if errorlevel 1 (
    echo [ERROR] Failed to setup port forwarding
    pause
    exit /b 1
)
echo [OK] Port forwarding: tcp:5277 -^> tcp:5277
echo.

REM Step 4: Start Head Unit Server on phone
echo [4/5] Starting Android Auto Head Unit Server on phone...
echo This may take a few seconds...
%ADB% shell am force-stop com.google.android.projection.gearhead >nul 2>&1
timeout /t 1 /nobreak >nul
%ADB% shell am start-foreground-service -a com.google.android.gms.car.service.START com.google.android.projection.gearhead/.HeadUnitService
timeout /t 3 /nobreak >nul
echo [OK] Server started
echo.

REM Step 5: Launch DHU
echo [5/5] Launching Desktop Head Unit...
echo.
if not exist %DHU% (
    echo [ERROR] Desktop Head Unit not found!
    echo.
    echo Install DHU:
    echo 1. Open Android Studio
    echo 2. Tools -^> SDK Manager
    echo 3. SDK Tools tab
    echo 4. Check "Android Auto Desktop Head Unit Emulator"
    echo 5. Click Apply
    echo.
    pause
    exit /b 1
)

echo ========================================
echo  DHU Starting...
echo ========================================
echo.
echo On your phone:
echo 1. Accept the Android Auto connection prompt
echo 2. Keep phone unlocked
echo.
echo In DHU window:
echo 1. Open Mavrixfy app on phone
echo 2. Play a song
echo 3. Media controls should appear in DHU left panel
echo 4. Tap media card to see full screen
echo.
echo Press Ctrl+C to stop DHU
echo ========================================
echo.

%DHU%

@echo off
echo Checking device connection...
echo.

set ADB="%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"

%ADB% devices -l

echo.
echo If you see a device listed above, you're ready!
echo If not:
echo   1. Make sure USB cable is connected
echo   2. Enable USB Debugging on phone
echo   3. Tap "Allow" on the USB debugging prompt
echo.
pause

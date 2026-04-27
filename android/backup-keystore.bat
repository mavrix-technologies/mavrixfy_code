@echo off
echo ========================================
echo   Backup Mavrixfy Keystore
echo ========================================
echo.

set KEYSTORE=..\mavrixfy-upload-key.jks

if not exist "%KEYSTORE%" (
    echo ❌ Keystore not found!
    echo.
    echo Please create it first:
    echo   cd android
    echo   create-keystore.bat
    echo.
    pause
    exit /b 1
)

echo Found keystore: %KEYSTORE%
echo.
echo Creating backup folders...

REM Create backup directories
if not exist "C:\Secure_Backups\Mavrixfy" mkdir "C:\Secure_Backups\Mavrixfy"

echo.
echo Backing up to:
echo.

REM Backup 1: Secure folder on PC
echo [1/3] C:\Secure_Backups\Mavrixfy\
copy "%KEYSTORE%" "C:\Secure_Backups\Mavrixfy\mavrixfy-upload-key.jks" /Y >nul
if %errorlevel% equ 0 (
    echo       ✅ Success
) else (
    echo       ❌ Failed
)

REM Backup 2: Desktop (easy access)
echo [2/3] Desktop\Mavrixfy_Keystore\
if not exist "%USERPROFILE%\Desktop\Mavrixfy_Keystore" mkdir "%USERPROFILE%\Desktop\Mavrixfy_Keystore"
copy "%KEYSTORE%" "%USERPROFILE%\Desktop\Mavrixfy_Keystore\mavrixfy-upload-key.jks" /Y >nul
if %errorlevel% equ 0 (
    echo       ✅ Success
) else (
    echo       ❌ Failed
)

REM Backup 3: Documents folder
echo [3/3] Documents\Mavrixfy_Secure\
if not exist "%USERPROFILE%\Documents\Mavrixfy_Secure" mkdir "%USERPROFILE%\Documents\Mavrixfy_Secure"
copy "%KEYSTORE%" "%USERPROFILE%\Documents\Mavrixfy_Secure\mavrixfy-upload-key.jks" /Y >nul
if %errorlevel% equ 0 (
    echo       ✅ Success
) else (
    echo       ❌ Failed
)

echo.
echo ========================================
echo   Backup Complete!
echo ========================================
echo.
echo Keystore backed up to:
echo 1. C:\Secure_Backups\Mavrixfy\
echo 2. Desktop\Mavrixfy_Keystore\
echo 3. Documents\Mavrixfy_Secure\
echo.
echo IMPORTANT NEXT STEPS:
echo.
echo 1. Copy to external drive or USB
echo 2. Upload to cloud storage (Google Drive/OneDrive)
echo 3. Save passwords in password manager
echo 4. Keep this file SECURE and PRIVATE
echo.
echo ⚠️  NEVER commit keystore to Git!
echo ⚠️  NEVER share with anyone!
echo.
pause

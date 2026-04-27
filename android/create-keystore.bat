@echo off
echo ========================================
echo   Creating Mavrixfy Upload Keystore
echo ========================================
echo.
echo This will create a secure keystore for signing your APK
echo.
echo IMPORTANT: 
echo - Choose a STRONG password
echo - SAVE your passwords securely
echo - BACKUP the keystore file
echo - You'll need these for ALL future updates
echo.
pause
echo.

keytool -genkeypair -v -storetype PKCS12 -keystore ..\mavrixfy-upload-key.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000

echo.
echo ========================================
echo   Keystore Created Successfully!
echo ========================================
echo.
echo Location: mavrixfy-upload-key.jks (project root)
echo.
echo NEXT STEPS:
echo 1. Create android\gradle.properties with your passwords
echo 2. Add gradle.properties to .gitignore
echo 3. Backup keystore to a secure location
echo 4. Rebuild AAB: gradlew bundleRelease
echo.
echo See KEYSTORE_SETUP.md for detailed instructions
echo.
pause

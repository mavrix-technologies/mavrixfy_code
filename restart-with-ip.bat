@echo off
echo ================================================
echo  Restarting Mavrixfy App with IP Address
echo ================================================
echo.
echo Clearing cache...
rd /s /q .expo 2>nul
rd /s /q node_modules\.cache 2>nul
echo Cache cleared!
echo.
echo Starting Expo with --clear flag...
echo.
npx expo start --clear

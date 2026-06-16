@echo off
echo ========================================
echo   Starting YouTube Music Backend
echo ========================================
echo.

cd youtube-music-api

echo Checking Python installation...
python --version
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8 or higher
    pause
    exit /b 1
)

echo.
echo Starting backend server...
echo Backend will run on: http://0.0.0.0:8000
echo.
echo Your computer IP addresses:
ipconfig | findstr /i "IPv4"
echo.
echo Use one of these IPs in your .env file
echo Example: EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://192.168.1.11:8000
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

python main.py

pause

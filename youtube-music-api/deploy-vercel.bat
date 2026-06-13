@echo off
REM Deploy YouTube Music API to Vercel

echo ========================================
echo Deploying to Vercel
echo ========================================
echo.

REM Check if Vercel CLI is installed
vercel --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Vercel CLI is not installed
    echo.
    echo Installing Vercel CLI...
    npm install -g vercel
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install Vercel CLI
        echo Please install Node.js first from https://nodejs.org/
        pause
        exit /b 1
    )
)

echo [1/2] Vercel CLI found
vercel --version

echo.
echo [2/2] Deploying to Vercel...
echo.
vercel

echo.
echo ========================================
echo Deployment complete!
echo.
echo Copy the deployment URL and update your .env file:
echo EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=https://your-deployment-url.vercel.app
echo ========================================
echo.
pause

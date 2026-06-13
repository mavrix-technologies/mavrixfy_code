@echo off
echo.
echo ========================================
echo  Starting Python YouTube Music Backend
echo ========================================
echo.

cd youtube-music-api

REM Check if setup was done
if not exist venv (
    echo [WARNING] Backend not set up yet!
    echo.
    echo Running setup first...
    call setup.bat
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Setup failed
        pause
        exit /b 1
    )
)

echo Starting backend server...
echo Server will run on http://localhost:8000
echo API docs: http://localhost:8000/docs
echo.
echo Press Ctrl+C to stop
echo.

call start.bat

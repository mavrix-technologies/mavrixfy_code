@echo off
REM YouTube Music API Backend Start Script for Windows

echo Starting YouTube Music API Backend...
echo.

REM Check if virtual environment exists
if not exist venv (
    echo [ERROR] Virtual environment not found
    echo Please run setup.bat first
    pause
    exit /b 1
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Start the server
echo Server starting at http://localhost:8000
echo API docs available at http://localhost:8000/docs
echo.
echo Press Ctrl+C to stop the server
echo.

python main.py

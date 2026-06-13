@echo off
REM YouTube Music API Backend Setup Script for Windows

echo ========================================
echo YouTube Music API Backend Setup
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [1/4] Python found
python --version

REM Create virtual environment
echo.
echo [2/4] Creating virtual environment...
if exist venv (
    echo Virtual environment already exists, skipping...
) else (
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment
        pause
        exit /b 1
    )
    echo Virtual environment created successfully
)

REM Activate virtual environment and install dependencies
echo.
echo [3/4] Installing dependencies...
call venv\Scripts\activate.bat
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo [4/4] Setup complete!
echo.
echo ========================================
echo To start the server:
echo   1. Activate the virtual environment: venv\Scripts\activate
echo   2. Run the server: python main.py
echo.
echo Or simply run: start.bat
echo ========================================
echo.
pause

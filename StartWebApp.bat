@echo off
title InDesign Repather Web App
color 0A
echo ========================================
echo    InDesign Repather Web Application
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python from https://python.org
    echo.
    pause
    exit /b 1
)

echo Python found. Checking dependencies...
echo.

REM Check if pywin32 is installed
python -c "import win32com.client" >nul 2>&1
if errorlevel 1 (
    echo Installing required dependencies...
    pip install pywin32
    if errorlevel 1 (
        echo ERROR: Failed to install pywin32
        echo Please run: pip install pywin32
        echo.
        pause
        exit /b 1
    )
    echo Dependencies installed successfully!
    echo.
)

echo All dependencies are ready!
echo.
echo Starting web server...
echo The application will open in your browser automatically.
echo Keep this window open while using the app.
echo.
echo To stop the server, press Ctrl+C
echo.
echo ========================================
echo.

python generate_web_app.py

echo.
echo Server stopped. Press any key to exit...
pause >nul

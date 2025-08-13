@echo off
title InDesign Link Repather
echo ========================================
echo InDesign Link Repather
echo ========================================
echo.

REM Check if Python is available
echo Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: Python is not installed or not in PATH
    echo.
    echo Please install Python 3.13 from Microsoft Store:
    echo 1. Open Microsoft Store
    echo 2. Search for "Python 3.13"
    echo 3. Click "Get" or "Install"
    echo 4. Wait for installation to complete
    echo 5. Run this script again
    echo.
    echo Alternative: Download from https://python.org
    echo Make sure to check "Add Python to PATH" during installation
    echo.
    pause
    exit /b 1
)

echo Python is installed.
echo.

echo Python is installed.
echo.
echo Starting InDesign Link Repather...
echo The script will automatically install any missing dependencies.
echo.

echo.
echo ========================================
echo Starting InDesign Link Repather...
echo ========================================
echo.
echo The web interface will open in your browser.
echo Make sure InDesign is running before using the tool.
echo.
echo Press Ctrl+C to stop the server when done.
echo.

REM Start the Python server
python indesign_link_repath.py

echo.
echo Server stopped.
pause

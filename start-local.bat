@echo off
echo ================================================
echo   CryptoDUST - Local Development Starter
echo ================================================
echo.
echo This will try to start the project.
echo.
echo IMPORTANT: If this fails, your npm is broken.
echo Please reinstall Node.js from https://nodejs.org (LTS version)
echo Then run this file again.
echo.
pause
cd /d "%~dp0"
npm install
if %errorlevel% neq 0 (
    echo.
    echo npm install failed. Please fix your Node.js installation.
    pause
    exit /b
)
npm run dev
pause

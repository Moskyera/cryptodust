# CryptoDUST Local Development Helper
# Right-click this file → "Run with PowerShell"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   CryptoDUST - Local Development Starter" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$projectPath = $PSScriptRoot
Set-Location $projectPath

Write-Host "Project folder: $projectPath" -ForegroundColor Gray
Write-Host ""

# Check if npm works at all
try {
    $npmVersion = npm --version 2>$null
    if ($LASTEXITCODE -eq 0 -and $npmVersion) {
        Write-Host "npm detected (version: $npmVersion)" -ForegroundColor Green
    } else {
        throw "Broken"
    }
} catch {
    Write-Host "ERROR: npm is broken on your system." -ForegroundColor Red
    Write-Host ""
    Write-Host "This is very common on Windows." -ForegroundColor Yellow
    Write-Host "Please fix it first:" -ForegroundColor Yellow
    Write-Host " → Go to https://nodejs.org" -ForegroundColor Yellow
    Write-Host " → Download the LTS version" -ForegroundColor Yellow
    Write-Host " → Run the installer (choose Repair or reinstall)" -ForegroundColor Yellow
    Write-Host " → Close this window and try again" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}

Write-Host ""
Write-Host "Installing project dependencies..." -ForegroundColor Cyan
Write-Host "(This can take 30-90 seconds on first run)" -ForegroundColor Gray

npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "npm install failed. Your Node/npm installation is still broken." -ForegroundColor Red
    Write-Host "Please reinstall Node.js from https://nodejs.org" -ForegroundColor Yellow
    Read-Host "Press Enter to close"
    exit 1
}

Write-Host ""
Write-Host "Starting CryptoDUST development server..." -ForegroundColor Green
Write-Host ""
Write-Host "When you see a link like http://localhost:5173, COPY IT and open it in your browser." -ForegroundColor Green
Write-Host "Do NOT double-click index.html — it will not work." -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl + C in this window to stop the server later." -ForegroundColor Gray
Write-Host ""

npm run dev

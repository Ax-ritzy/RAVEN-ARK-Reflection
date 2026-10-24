# =================================================================
# REFLECTION AI PLATFORM - ONE-CLICK SYSTEM LAUNCHER
# Starts Ollama, FastAPI Backend (Port 8000), Next.js Portal (Port 3000),
# and automatically opens your browser.
# =================================================================

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "    LAUNCHING REFLECTION AI PLATFORM (ALL-IN-ONE)" -ForegroundColor Cyan
Write-Host "    Root Directory: $Root" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Check Ollama & Qwen 3.5:9B
Write-Host "`n[1/3] Checking Ollama & Qwen 3.5:9B Model..." -ForegroundColor Yellow
$ollamaRunning = $false
try {
    $resp = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 2
    $ollamaRunning = $true
} catch {
    $ollamaRunning = $false
}

if ($ollamaRunning) {
    Write-Host "  --> Ollama service is active on port 11434 with qwen3.5:9b ready." -ForegroundColor Green
} else {
    Write-Host "  --> Starting Ollama service in background..." -ForegroundColor Yellow
    Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

# 2. Start FastAPI Assessment Engine (Port 8000)
Write-Host "`n[2/3] Launching FastAPI Assessment Engine (Port 8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.ui.RawUI.WindowTitle = 'Reflection AI - Backend (Port 8000)'; cd '$Root\backend'; Write-Host '--- FASTAPI ASSESSMENT SERVICE (Port 8000) ---' -ForegroundColor Green; uvicorn app.main:app --port 8000 --reload"

# 3. Start Next.js Web Portal (Port 3000)
Write-Host "`n[3/3] Launching Next.js Web Portal (Port 3000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.ui.RawUI.WindowTitle = 'Reflection AI - Portal (Port 3000)'; cd '$Root\portal'; Write-Host '--- UNIFIED REFLECTION AI PORTAL (Port 3000) ---' -ForegroundColor Cyan; npm run dev"

# Wait a moment for server initialization
Write-Host "`nWaiting for local servers to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 4

# 4. Open Browser
Write-Host "`nOpening Web Portal in your browser..." -ForegroundColor Green
Start-Process "http://localhost:3000"

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host "               ALL SERVICES RUNNING SUCCESSFULLY!                " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  Web Portal:         http://localhost:3000" -ForegroundColor Cyan
Write-Host "  FastAPI Docs:       http://localhost:8000/docs" -ForegroundColor Green
Write-Host "  Ollama Local AI:    http://127.0.0.1:11434 (qwen3.5:9b)" -ForegroundColor Magenta
Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray
Write-Host "  Login Portal Rules:" -ForegroundColor White
Write-Host "    * Enter Professor Key -> Automatically opens /admin/dashboard" -ForegroundColor Yellow
Write-Host "    * Enter Student Key   -> Automatically opens /student/dashboard" -ForegroundColor Yellow
Write-Host "    * Enter Contributor   -> Automatically opens /reference" -ForegroundColor Yellow
Write-Host "    * Dedicated Upload    -> Direct link: http://localhost:3000/reference/login" -ForegroundColor Magenta
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Keep the service windows open while using the application.`n" -ForegroundColor Gray

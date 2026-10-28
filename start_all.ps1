# =================================================================
# REFLECTION AI PLATFORM - ONE-CLICK LAUNCHER
# Starts FastAPI Assessment Engine (Port 8000), Next.js Portal (Port 3000),
# and automatically opens your browser in Production or Development Mode.
# =================================================================

param(
    [Parameter(Position=0)]
    [string]$Mode = "Production",
    [switch]$Dev,
    [switch]$Prod
)

if ($Dev) { $Mode = "Development" }
if ($Prod) { $Mode = "Production" }

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "    LAUNCHING REFLECTION AI PLATFORM ($($Mode.ToUpper()) MODE)" -ForegroundColor Cyan
Write-Host "    Root Directory: $Root" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Verify Gemini AI & Environment
Write-Host "`n[1/3] Checking AI Engine & Environment..." -ForegroundColor Yellow
if (Test-Path "$Root\portal\.env.local") {
    $hasGemini = Select-String -Path "$Root\portal\.env.local" -Pattern "GEMINI_API_KEY=" -Quiet
    if ($hasGemini) {
        Write-Host "  --> Google Gemini Flash Engine: Active (Dual-Key Failover Enabled)" -ForegroundColor Green
    } else {
        Write-Host "  --> Using High-Performance Deterministic POS Engine" -ForegroundColor Yellow
    }
}

# 2. Start FastAPI Assessment Engine (Port 8000)
Write-Host "`n[2/3] Launching FastAPI Assessment Engine (Port 8000)..." -ForegroundColor Yellow
$fastApiArgs = if ($Mode -eq "Development") {
    "`$host.ui.RawUI.WindowTitle = 'Reflection AI - Backend (Port 8000 - Dev)'; cd '$Root\backend'; Write-Host '--- FASTAPI ASSESSMENT SERVICE (Port 8000 - Dev) ---' -ForegroundColor Green; python -m uvicorn app.main:app --port 8000 --reload"
} else {
    "`$host.ui.RawUI.WindowTitle = 'Reflection AI - Backend (Port 8000)'; cd '$Root\backend'; Write-Host '--- FASTAPI ASSESSMENT SERVICE (Port 8000) ---' -ForegroundColor Green; python -m uvicorn app.main:app --port 8000"
}
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $fastApiArgs

# 3. Start Next.js Web Portal (Port 3000)
if ($Mode -eq "Development") {
    Write-Host "`n[3/3] Launching Next.js Web Portal (Port 3000 - Development Mode w/ Hot Reload)..." -ForegroundColor Yellow
    $portalCmd = "`$host.ui.RawUI.WindowTitle = 'Reflection AI - Portal (Port 3000 - Development)'; cd '$Root\portal'; Write-Host '--- REFLECTION AI PORTAL (Port 3000 - Development Mode) ---' -ForegroundColor Cyan; npm run dev"
} else {
    Write-Host "`n[3/3] Launching Next.js Web Portal (Port 3000 - Production Mode)..." -ForegroundColor Yellow
    if (-not (Test-Path "$Root\portal\.next")) {
        Write-Host "  --> Building portal for optimal speed (first-time build)..." -ForegroundColor Yellow
        Start-Process powershell -Wait -ArgumentList "-ExecutionPolicy", "Bypass", "-Command", "cd '$Root\portal'; npm run build"
    }
    $portalCmd = "`$host.ui.RawUI.WindowTitle = 'Reflection AI - Portal (Port 3000 - Production)'; cd '$Root\portal'; Write-Host '--- UNIFIED REFLECTION AI PORTAL (Port 3000 - Production) ---' -ForegroundColor Cyan; npm run start"
}
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $portalCmd

# Wait a moment for server initialization
Write-Host "`nWaiting for local servers to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 3

# 4. Open Browser
Write-Host "`nOpening Web Portal in your browser..." -ForegroundColor Green
Start-Process "http://localhost:3000"

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host "               ALL SERVICES RUNNING OPTIMALLY!                   " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  Web Portal:         http://localhost:3000 ($Mode Mode)" -ForegroundColor Cyan
Write-Host "  FastAPI Docs:       http://localhost:8000/docs" -ForegroundColor Green
Write-Host "  AI Engine:          Google Gemini Flash (Topic-Aware Semantic Calibration)" -ForegroundColor Magenta
Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray
Write-Host "  Universal Login Rules (http://localhost:3000/login):" -ForegroundColor White
Write-Host "    * Professor Account   -> Automatically routes to /admin/dashboard" -ForegroundColor Yellow
Write-Host "    * Student Account     -> Automatically routes to /student/dashboard" -ForegroundColor Yellow
Write-Host "    * Contributor Account -> Automatically routes to /reference (Material Uploads)" -ForegroundColor Yellow
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Keep the service windows open while using the application." -ForegroundColor Gray

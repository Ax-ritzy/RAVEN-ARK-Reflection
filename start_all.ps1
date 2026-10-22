# =================================================================
# REFLECTION AI ASSESSMENT SYSTEM - UNIFIED SERVICE LAUNCHER
# Starts Backend (Port 8000) and Unified Web Portal (Port 3000)
# =================================================================

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " LAUNCHING REFLECTION AI ASSESSMENT PLATFORM (UNIFIED)" -ForegroundColor Cyan
Write-Host " Root Directory: $Root" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Start FastAPI Assessment Engine (Port 8000)
Write-Host "[1/2] Starting Assessment Engine (FastAPI on Port 8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\backend'; Write-Host '--- FASTAPI ASSESSMENT SERVICE (Port 8000) ---' -ForegroundColor Green; uvicorn app.main:app --port 8000 --reload"

# 2. Start Unified Portal (Port 3000)
Write-Host "[2/2] Starting Unified Web Portal (Next.js on Port 3000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\portal'; Write-Host '--- UNIFIED REFLECTION AI PORTAL (Port 3000) ---' -ForegroundColor Cyan; npm run dev"

Write-Host "`nAll services have been launched successfully!" -ForegroundColor Green
Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray
Write-Host "  Unified Web Portal:       http://localhost:3000" -ForegroundColor Cyan
Write-Host "  FastAPI Backend API:      http://localhost:8000/docs" -ForegroundColor Green
Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray
Write-Host "  Login Routing Behavior:" -ForegroundColor White
Write-Host "    * Sign in with Professor credentials -> Automatically routed to /admin/dashboard" -ForegroundColor Magenta
Write-Host "    * Sign in with Student credentials   -> Automatically routed to /student/dashboard" -ForegroundColor Blue
Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray

# =================================================================
# REFLECTION AI ASSESSMENT SYSTEM - MULTI-SERVICE LOCAL LAUNCHER
# Starts Backend (8000), Student Portal (3000), and Professor Portal (3001)
# =================================================================

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " LAUNCHING REFLECTION AI ASSESSMENT PLATFORM" -ForegroundColor Cyan
Write-Host " Root Directory: $Root" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Start FastAPI Backend (Port 8000)
Write-Host "[1/3] Starting Assessment Engine (FastAPI on Port 8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\backend'; Write-Host '--- FASTAPI ASSESSMENT SERVICE (Port 8000) ---' -ForegroundColor Green; uvicorn app.main:app --port 8000 --reload"

# 2. Start Student Portal (Port 3000)
Write-Host "[2/3] Starting Student Portal (Next.js on Port 3000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\student-portal'; Write-Host '--- STUDENT PORTAL (Port 3000) ---' -ForegroundColor Blue; npm run dev"

# 3. Start Professor Admin Portal (Port 3001)
Write-Host "[3/3] Starting Professor Admin Portal (Next.js on Port 3001)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\professor-portal'; Write-Host '--- PROFESSOR ADMIN PORTAL (Port 3001) ---' -ForegroundColor Magenta; npm run dev"

Write-Host "`nAll 3 services have been launched in dedicated terminal windows!" -ForegroundColor Green
Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray
Write-Host "  * Student Portal:           http://localhost:3000" -ForegroundColor Cyan
Write-Host "  * Professor Admin Portal:   http://localhost:3001" -ForegroundColor Magenta
Write-Host "  * Assessment Backend API:   http://localhost:8000/docs" -ForegroundColor Green
Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray

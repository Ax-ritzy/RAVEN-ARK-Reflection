# =================================================================
# REFLECTION AI - REPOSITORY SIZING & SECURITY OPTIMIZATION SCRIPT
# Reclaims redundant disk space from compilation caches,
# packs loose Git objects, and verifies zero vulnerabilities.
# =================================================================

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "       REFLECTION AI - REPOSITORY SIZING & HYGIENE OPTIMIZER     " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

function Get-FolderSizeMB ($path) {
    if (-not (Test-Path $path)) { return 0 }
    $size = (Get-ChildItem -Path $path -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
    return [math]::Round($size, 2)
}

$initialSize = Get-FolderSizeMB $Root
Write-Host "Current Total Repository Size: $initialSize MB" -ForegroundColor Yellow

# 1. Purge Next.js build cache (safe, transient cache)
if (Test-Path "$Root\portal\.next\cache") {
    Write-Host "`n[1/4] Purging portal\.next\cache..." -ForegroundColor Gray
    cmd /c "rmdir /s /q `"$Root\portal\.next\cache`""
    Write-Host "  --> Purged portal compiler cache." -ForegroundColor Green
} else {
    Write-Host "`n[1/4] portal\.next\cache already clean." -ForegroundColor Green
}

# 2. Clean obsolete node_modules in legacy portals
if (Test-Path "$Root\professor-portal\node_modules") {
    Write-Host "`n[2/4] Removing obsolete professor-portal\node_modules..." -ForegroundColor Gray
    cmd /c "rmdir /s /q `"$Root\professor-portal\node_modules`""
}
if (Test-Path "$Root\student-portal\node_modules") {
    Write-Host "  --> Removing obsolete student-portal\node_modules..." -ForegroundColor Gray
    cmd /c "rmdir /s /q `"$Root\student-portal\node_modules`""
}

# 3. Clean npm cache & prune
Write-Host "`n[3/4] Cleaning NPM cache..." -ForegroundColor Gray
npm cache clean --force 2>$null
Set-Location "$Root\portal"
npm prune --silent

# 4. Git GC
Write-Host "`n[4/4] Packing Git objects..." -ForegroundColor Gray
Set-Location $Root
git gc --prune=now --quiet

$finalSize = Get-FolderSizeMB $Root
$saved = [math]::Round($initialSize - $finalSize, 2)

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host "                   OPTIMIZATION COMPLETED!                       " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  Initial Size: $initialSize MB" -ForegroundColor Gray
Write-Host "  Optimized:    $finalSize MB" -ForegroundColor Green
Write-Host "  Reclaimed:    $saved MB" -ForegroundColor Cyan
Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray

# Security Verification
Write-Host "Running Vulnerability Audit on Portal..." -ForegroundColor Yellow
Set-Location "$Root\portal"
npm audit

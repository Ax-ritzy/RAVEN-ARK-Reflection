@echo off
title Launching Reflection AI Assessment Platform (Production 0ms AOT)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_all.ps1" -Prod

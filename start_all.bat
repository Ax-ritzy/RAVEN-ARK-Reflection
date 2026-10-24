@echo off
title Launching Reflection AI Assessment Platform
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_all.ps1"

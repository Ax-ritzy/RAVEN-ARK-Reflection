@echo off
title Launch Reflection AI Platform (Development Mode)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_all.ps1" -Mode Development

@echo off
title Figma2Insight Dashboard
echo ========================================================
echo               Figma2Insight Launcher
echo ========================================================
echo.
echo Starting Python backend server on http://localhost:8001...
start "Figma2Insight Server" python server.py
timeout /t 3 /nobreak >nul
echo Opening dashboard in your default browser...
start http://localhost:8001/#/workspace
echo.
echo ========================================================
echo Dashboard is running at http://localhost:8001
echo To stop, close the "Figma2Insight Server" terminal window.
echo ========================================================
pause


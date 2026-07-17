@echo off
title HOLLOWCRAFT - LAN
cd /d "%~dp0"
REM Use a bundled node.exe if it ships alongside (friend's zip), else the system node.
set "NODE=node"
if exist "%~dp0node\node.exe" set "NODE=%~dp0node\node.exe"
echo ============================================================
echo   HOLLOWCRAFT  -  LAN / Hamachi co-op
echo ============================================================
echo.
echo Starting the local game server...
echo Your browser opens the game in a couple of seconds.
echo.
echo   HOST:  menu ^> Multiplayer ^> Host a game
echo   JOIN:  menu ^> Multiplayer ^> pick a game from the list ^> Join
echo.
echo Keep this window open while you play. Close it to stop.
echo ============================================================
echo.
REM open the browser 2s later (once the server is listening), without blocking it
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:8788"
"%NODE%" mp-server.js
echo.
echo (server stopped) - press any key to exit.
pause >nul

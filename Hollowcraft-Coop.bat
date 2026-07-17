@echo off
title HOLLOWCRAFT - CO-OP HOST (relay + public tunnel)
cd /d "%~dp0"
echo ============================================================
echo   HOLLOWCRAFT co-op - starting the relay + a public link...
echo ============================================================
echo.
REM 1) relay in its own window so it keeps running
start "Hollowcraft Relay :8788" cmd /k "cd /d %~dp0 && node mp-server.js"
timeout /t 2 /nobreak >nul
echo A public tunnel is opening. In a few seconds a line like:
echo.
echo        https://SOMETHING.trycloudflare.com
echo.
echo will appear below - THAT is your shareable link.
echo.
echo   YOU (host):    open    ^<that-url^>/?host      in your browser
echo   YOUR FRIEND:   send    ^<that-url^>/?join      (they click it, drop straight in)
echo.
echo Keep BOTH windows open while you play. Close them to end the session.
echo ============================================================
echo.
cloudflared tunnel --url http://localhost:8788
echo.
echo (tunnel closed) - press any key to exit.
pause >nul

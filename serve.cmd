@echo off
rem Keeps the SamjhaDo server running: if it ever stops or crashes, it restarts by itself.
rem Close this window to stop SamjhaDo.
title SamjhaDo server
cd /d "%~dp0"
:run
echo [%time%] Starting SamjhaDo on http://localhost:3020 ...
call npx next dev -p 3020
echo.
echo [%time%] Server stopped. Restarting in 3 seconds... (close this window to stop SamjhaDo)
timeout /t 3 /nobreak >nul
goto run

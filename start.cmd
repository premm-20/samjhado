@echo off
rem ---- SamjhaDo: start the app and open it in Chrome (works from any folder it is cloned into) ----
title SamjhaDo
setlocal
cd /d "%~dp0"
set "PORT=3020"
set "URL=http://localhost:%PORT%"

rem Already running? Just open it.
curl.exe -s -o nul --max-time 3 "%URL%" && goto open

rem Node.js is required.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nahi mila. Pehle https://nodejs.org se Node.js LTS install karo, phir dobara chalao.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)

rem First run on this laptop: install dependencies.
if not exist "node_modules" (
  echo Pehli baar setup ho raha hai ^(dependencies install^), 1-3 minute lagenge...
  call npm install
  if errorlevel 1 (
    echo npm install fail hua. Internet check karo aur dobara chalao.
    pause
    exit /b 1
  )
)

rem Gemini key: ask once and save it in .env.local (never committed to git).
findstr /b /c:"GEMINI_API_KEY=" ".env.local" 2>nul | findstr /r /c:"GEMINI_API_KEY=..*" >nul
if errorlevel 1 (
  echo.
  echo Gemini API key chahiye ^(https://aistudio.google.com/apikey se free milti hai^).
  set /p "KEY=Apni Gemini API key paste karo aur Enter dabao: "
  call :savekey
)

echo SamjhaDo start ho raha hai... (minimized "SamjhaDo server" window isse chalu rakhti hai)
start "SamjhaDo server" /min cmd /c ""%~dp0serve.cmd""

rem Wait up to ~90 seconds for the app to answer.
set /a tries=0
:wait
timeout /t 2 /nobreak >nul
curl.exe -s -o nul --max-time 3 "%URL%" && goto open
set /a tries+=1
if %tries% lss 45 goto wait
echo SamjhaDo start nahi hua. "SamjhaDo server" window mein error dekho.
pause
exit /b 1

:open
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" "%URL%"
) else (
  start "" "%URL%"
)
exit /b 0

:savekey
rem Keep any other settings, replace only the key line.
if exist ".env.local" (
  findstr /v /b /c:"GEMINI_API_KEY=" ".env.local" > ".env.local.tmp"
) else (
  type nul > ".env.local.tmp"
)
>> ".env.local.tmp" echo GEMINI_API_KEY=%KEY%
move /y ".env.local.tmp" ".env.local" >nul
exit /b 0

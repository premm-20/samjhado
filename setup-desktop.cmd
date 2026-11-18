@echo off
rem ---- One-time setup on a new laptop: put a "SamjhaDo" start button on the Desktop ----
title SamjhaDo setup
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$desk = [Environment]::GetFolderPath('Desktop');" ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desk 'SamjhaDo.lnk'));" ^
  "$s.TargetPath = (Join-Path '%~dp0' 'start.cmd');" ^
  "$s.WorkingDirectory = '%~dp0';" ^
  "$s.IconLocation = (Join-Path '%~dp0' 'public\samjhado.ico') + ',0';" ^
  "$s.Description = 'SamjhaDo - AI whiteboard tutor';" ^
  "$s.WindowStyle = 7;" ^
  "$s.Save();" ^
  "Write-Host ('Desktop pe SamjhaDo button ban gaya: ' + $desk)"
echo.
echo Ab Desktop pe "SamjhaDo" pe double-click karo. Pehli baar setup aur Gemini key puchega.
pause

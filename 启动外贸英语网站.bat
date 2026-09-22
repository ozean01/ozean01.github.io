@echo off
setlocal
rem ForeignTradeEnglish launcher (Windows).
rem
rem WHY THIS FILE IS PURE ASCII + CRLF:
rem   cmd.exe decodes a BOM-less .bat using the console code page and finds
rem   line boundaries by CR. Non-ASCII bytes in this file therefore work from
rem   one console and fail from another (Explorer double-click starts cmd at
rem   cp936, then a mid-file chcp change corrupts the remaining lines), and
rem   LF-only endings break its parsing as well. The site directory is taken
rem   at runtime from %~dp0, so no Chinese character needs to live in here.
rem
set "PS1=%~dp0start-site.ps1"
if not exist "%PS1%" (
  echo [ERROR] start-site.ps1 was not found next to this .bat
  echo         expected: %PS1%
  echo.
  pause
  exit /b 1
)
rem %* forwards arguments, e.g.  <this file> -AllowPortChange
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
echo.
echo [launcher exited, code %ERRORLEVEL%]
pause

[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$url = "http://localhost:8000"

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "   ForeignTradeEnglish - Local Server" -ForegroundColor White
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

function Find-PythonCmd {
  foreach ($cand in @("python","py")) {
    $cmd = Get-Command $cand -ErrorAction SilentlyContinue
    if ($cmd) {
      try {
        $v = & $cand --version 2>&1
        if ($LASTEXITCODE -eq 0 -or "$v" -match "\d\.") { return $cand }
      } catch { }
    }
  }
  return $null
}

$pyCmd = Find-PythonCmd
if ($pyCmd) {
  Write-Host ("[OK] Using Python: " + $pyCmd) -ForegroundColor Green
  $pver = & $pyCmd --version 2>&1
  Write-Host ("      Version: " + $pver)
  Write-Host ""
  Write-Host ("  URL:  " + $url) -ForegroundColor Yellow
  Write-Host "  Opening browser..." -ForegroundColor Green
  try { Start-Process $url } catch { Write-Host "  open browser failed" -ForegroundColor DarkYellow }
  Write-Host ""
  Write-Host "  -------- Server log (close window to stop) --------" -ForegroundColor Cyan
  Write-Host ""
  & $pyCmd -m http.server 8000 --bind 127.0.0.1
  Write-Host ""
  Write-Host "  -------- Server stopped --------" -ForegroundColor Cyan
} else {
  Write-Host "[ERROR] Python not found" -ForegroundColor Red
  Write-Host ""
  Write-Host "  Install Python: https://www.python.org/downloads/" -ForegroundColor Yellow
  Write-Host "  Fallback: double-click index.html (browse only)" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "Press any key to close..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

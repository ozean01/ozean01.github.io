[CmdletBinding()]
param(
  # Start the server only; do not open a browser (for automated verification).
  [switch]$NoBrowser
)

# =====================================================================
#  IMPORTANT - keep this file ASCII-only.
#  The .bat wrapper runs it with powershell.exe (Windows PowerShell 5.1),
#  which decodes a BOM-less .ps1 using the system ANSI code page (GBK on
#  Chinese Windows). Non-ASCII literals therefore become mojibake and can
#  break parsing - the launcher would fail with a syntax error on launch.
#
#  Port strategy (fix):
#  Previously this script opened the browser FIRST and bound port 8000
#  AFTERWARDS. If anything else already owned 8000, python failed to bind
#  (WinError 10013/10048) while the browser had already been opened - the
#  user then saw whatever app owned 8000 instead of the learning site.
#  New order: probe ports -> pick a bindable one -> serve -> wait until the
#  server really answers 200 -> only then open the browser.
#  Default port is 8088 (NOT 8000): on the author's machine a knowledge-card
#  app intermittently grabs 127.0.0.1:8000/8001 exclusively.
# =====================================================================

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$preferredPort = 8088
$maxTries = 20

function Test-PortBindable([int]$Port) {
  # Actually try to bind: detects "already in use", "exclusively held" and
  # "inside a reserved/excluded range" with one mechanism.
  $listener = $null
  try {
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($listener) { try { $listener.Stop() } catch { } }
  }
}

function Get-PortOwner([int]$Port) {
  try {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
    if (-not $conn) { return $null }
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    if ($proc) { return ("{0} (PID {1})" -f $proc.ProcessName, $conn.OwningProcess) }
    return ("PID {0}" -f $conn.OwningProcess)
  } catch { return $null }
}

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

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "   ForeignTradeEnglish - Local Server" -ForegroundColor White
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# ---------- 1) Pick a bindable port BEFORE opening any browser ----------
$port = $null
for ($p = $preferredPort; $p -lt ($preferredPort + $maxTries); $p++) {
  if (Test-PortBindable $p) { $port = $p; break }
}

if (-not $port) {
  Write-Host ("[ERROR] Ports {0}-{1} are all unavailable; aborted." -f $preferredPort, ($preferredPort + $maxTries - 1)) -ForegroundColor Red
  Write-Host "        Server NOT started and browser NOT opened (so you never" -ForegroundColor DarkYellow
  Write-Host "        end up looking at somebody else's app by accident)." -ForegroundColor DarkYellow
  Write-Host ""
  Write-Host ("  Check who owns {0}:" -f $preferredPort) -ForegroundColor Yellow
  Write-Host ('    Get-NetTCPConnection -LocalPort ' + $preferredPort + ' -State Listen | Select-Object OwningProcess') -ForegroundColor Gray
  Write-Host '    Get-Process -Id <PID from above>' -ForegroundColor Gray
  Write-Host ""
  Write-Host "  Fallback: double-click index.html (browse only)." -ForegroundColor DarkYellow
  Write-Host ""
  Write-Host "Press any key to close..."
  $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
  exit 1
}

if ($port -ne $preferredPort) {
  $owner = Get-PortOwner $preferredPort
  Write-Host ("[WARN] Port {0} is taken; using {1} instead." -f $preferredPort, $port) -ForegroundColor Yellow
  if ($owner) { Write-Host ("       Owned by: {0}" -f $owner) -ForegroundColor DarkYellow }
  Write-Host ("       Use the URL printed below (NOT port {0})." -f $preferredPort) -ForegroundColor DarkYellow
  Write-Host ""
}

$url = "http://127.0.0.1:$port"

# ---------- 2) Locate Python ----------
$pyCmd = Find-PythonCmd
if (-not $pyCmd) {
  Write-Host "[ERROR] Python not found" -ForegroundColor Red
  Write-Host ""
  Write-Host "  Install Python: https://www.python.org/downloads/" -ForegroundColor Yellow
  Write-Host "  Fallback: double-click index.html (browse only)" -ForegroundColor DarkYellow
  Write-Host ""
  Write-Host "Press any key to close..."
  $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
  exit 1
}

Write-Host ("[OK] Using Python: " + $pyCmd) -ForegroundColor Green
$pver = & $pyCmd --version 2>&1
Write-Host ("      Version: " + $pver)
Write-Host ("      Site:    " + $root)
Write-Host ""
Write-Host ("  URL:  " + $url) -ForegroundColor Yellow
Write-Host "        (if the browser does not open by itself, open that URL manually)" -ForegroundColor DarkGray
if ($NoBrowser) {
  Write-Host "  (-NoBrowser: server only, browser will not be opened)" -ForegroundColor DarkYellow
} else {
  Write-Host "  Waiting for the port, then opening browser..." -ForegroundColor Green
}
Write-Host ""
Write-Host "  -------- Server log (close window to stop) --------" -ForegroundColor Cyan
Write-Host ""

# ---------- 3) Open the browser only after the port really accepts ----------
# Probe with a RAW TCP connect to 127.0.0.1: no DNS, no IPv6, no HTTP, no proxy.
#
# Why not "http://localhost + Invoke-WebRequest -TimeoutSec 2" (the first attempt):
# on this machine `localhost` resolves to ::1 first and that attempt stalls, so a
# single probe cost ~2.3s (measured) and EVERY probe tripped the 2s timeout. The
# loop then exhausted itself and gave up SILENTLY - the server was up, but no
# browser opened and nothing was printed. Now the wait is an instant TCP connect,
# and the URL is always printed up front, so a failure can never be invisible.
$opener = $null
if (-not $NoBrowser) {
  $opener = Start-Job -ArgumentList $url, $port -ScriptBlock {
    param($u, $p)
    for ($i = 0; $i -lt 100; $i++) {
      $client = New-Object System.Net.Sockets.TcpClient
      $up = $false
      try { $client.Connect('127.0.0.1', $p); $up = $true } catch { } finally { $client.Close() }
      if ($up) { Start-Process $u; return }
      Start-Sleep -Milliseconds 200
    }
  }
}

& $pyCmd -m http.server $port --bind 127.0.0.1

# ---------- 4) Cleanup ----------
if ($opener) {
  Stop-Job $opener -ErrorAction SilentlyContinue
  Remove-Job $opener -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "  -------- Server stopped --------" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to close..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

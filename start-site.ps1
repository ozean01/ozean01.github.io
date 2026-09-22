[CmdletBinding()]
param(
  # Start the server only; do not open a browser (for automated verification).
  [switch]$NoBrowser,
  # Explicit opt-in: allow starting on the next free port when the preferred
  # port is taken. Off by default because changing the port changes the browser
  # origin, which hides the learner's saved progress.
  [switch]$AllowPortChange,
  # Advanced/explicit: use this port instead of 8000. Note that the port is part
  # of the origin, so this also hides progress saved under another port.
  # (Also makes the port policy testable without racing a foreign app for 8000.)
  [int]$Port = 0
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
#  Default port is 8000 again, and the browser is opened at http://localhost:8000.
#
#  Why 8000 + localhost: localStorage is isolated per origin
#  (scheme+host+port), so the address bar must stay exactly what it has always
#  been or the learner's saved progress looks "gone" (it is still there, under
#  the old origin). 8088 was tried and reverted for that reason.
#  If 8000 is taken we still fall back automatically, but the script then warns
#  loudly that the origin changed (progress will not show up) and how to migrate.
#
#  The liveness probe deliberately uses 127.0.0.1 (not localhost): on this
#  machine `localhost` resolves to ::1 first and that attempt stalls ~2.3s, so a
#  localhost-based probe with a 2s timeout failed EVERY time and the browser
#  never opened. Probing an IPv4 literal avoids DNS, IPv6, HTTP and any proxy.
# =====================================================================

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

# Are we attached to an interactive console? Under a script / CI / redirected
# input there is nobody to answer a prompt, so every decision must fall back to
# the safe default (stop, never silently change the origin).
$interactive = $true
try {
  if ([Console]::IsInputRedirected) { $interactive = $false }
} catch { $interactive = $false }

$preferredPort = 8000
$maxTries = 20
if ($Port -gt 0) { $preferredPort = $Port }   # explicit override (see param docs)

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
  # Windows ships a "python.exe" Store stub in WindowsApps that opens the Store
  # instead of running Python - never accept that one.
  # The "--version" probe doubles as a liveness check, BUT a failed probe must
  # not be reported as "Python not found": some sandboxes/EDRs block a child
  # process from piping its stdout, which makes & python --version throw even
  # though Python is installed and usable (observed on this machine). So on a
  # probe failure we still accept the resolved command and let the real python
  # error surface later, which is far more actionable than a wrong "not found".
  foreach ($cand in @("python","py")) {
    $cmd = Get-Command $cand -ErrorAction SilentlyContinue
    if (-not $cmd) { continue }
    if ("$($cmd.Source)" -match '\\WindowsApps\\') { continue }
    try {
      $v = & $cand --version 2>&1
      if ($LASTEXITCODE -eq 0 -or "$v" -match "\d\.") { return $cand }
    } catch { }
    return $cand
  }
  return $null
}

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "   ForeignTradeEnglish - Local Server" -ForegroundColor White
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# ---------- 1) Pick the port BEFORE opening any browser ----------
# POLICY (deliberate): the port is part of the browser origin
# (origin = scheme+host+port), and the learner's saved progress lives in
# localStorage keyed by that origin. So switching ports does NOT merely change
# a number: it hides every saved word card, streak and note.
# Therefore this script NEVER switches ports on its own. If the preferred port
# is taken it stops and asks; non-interactive runs (scripts / CI / -NoBrowser)
# always stop instead of guessing. -AllowPortChange is the explicit opt-in.
$port = $null
if (Test-PortBindable $preferredPort) { $port = $preferredPort }

if (-not $port) {
  $owner = Get-PortOwner $preferredPort
  Write-Host ("[STOP] Port {0} is already in use." -f $preferredPort) -ForegroundColor Red
  if ($owner) { Write-Host ("       Owned by: {0}" -f $owner) -ForegroundColor DarkYellow }
  Write-Host ""
  Write-Host ("       Your saved progress lives under the origin http://localhost:{0}" -f $preferredPort) -ForegroundColor DarkYellow
  Write-Host "       (an origin is scheme+host+port). Starting on a different port would" -ForegroundColor DarkYellow
  Write-Host "       make that progress invisible, so this script will not switch ports" -ForegroundColor DarkYellow
  Write-Host "       by itself." -ForegroundColor DarkYellow
  Write-Host ""
  Write-Host "       1) Close/stop the app that owns the port, then run this launcher again" -ForegroundColor Yellow
  Write-Host "          (recommended - keeps your saved progress)" -ForegroundColor DarkYellow
  Write-Host "       2) Start anyway on the next free port (progress will NOT appear there)" -ForegroundColor Yellow
  Write-Host ""

  $allow = [bool]$AllowPortChange
  # Ask only when there is really a human at the console AND we are not in the
  # automated (-NoBrowser) mode. The prompt MUST time out: a double-clicked
  # window that waits forever looks exactly like "the site will not start",
  # which is the very failure this launcher exists to avoid. (Read-Host cannot
  # time out - it hung here for 60s+ during verification - hence the key poll.)
  if (-not $allow -and $interactive -and (-not $NoBrowser)) {
    Write-Host "  Press 1 or 2 within 20 seconds (no answer = stop, safest)..." -ForegroundColor DarkGray
    $deadline = (Get-Date).AddSeconds(20)
    $ans = $null
    while ($null -eq $ans -and (Get-Date) -lt $deadline) {
      try {
        if ([Console]::KeyAvailable) { $ans = [Console]::ReadKey($true).KeyChar }
      } catch { break }   # no usable console -> stop waiting, keep the safe default
      Start-Sleep -Milliseconds 150
    }
    if ($null -ne $ans) { Write-Host ("  You pressed: {0}" -f $ans) -ForegroundColor DarkGray }
    if ("$ans".Trim() -eq "2") { $allow = $true }
  }
  if (-not $allow) {
    Write-Host "  Stopped without starting anything (your progress is untouched)." -ForegroundColor DarkYellow
    Write-Host "  To allow switching ports in future runs, pass -AllowPortChange." -ForegroundColor DarkGray
    Write-Host ""
    if ($interactive) { Write-Host "Press any key to close..."; $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") }
    exit 1
  }

  for ($p = $preferredPort + 1; $p -lt ($preferredPort + $maxTries); $p++) {
    if (Test-PortBindable $p) { $port = $p; break }
  }
  if (-not $port) {
    Write-Host ("[ERROR] Ports {0}-{1} are all unavailable; aborted." -f $preferredPort, ($preferredPort + $maxTries - 1)) -ForegroundColor Red
    if ($interactive) { Write-Host "Press any key to close..."; $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") }
    exit 1
  }
}

# Address bar stays on `localhost` (the host the learner has always used).
# On the preferred port this is exactly the original origin => zero migration.
$url = "http://localhost:$port"

if ($port -ne $preferredPort) {
  Write-Host ("[WARN] Starting on port {0} instead of {1}." -f $port, $preferredPort) -ForegroundColor Yellow
  Write-Host ("       New origin: http://localhost:{0}" -f $port) -ForegroundColor Yellow
  Write-Host ("       Old progress is stored under http://localhost:{0} and will NOT show up here." -f $preferredPort) -ForegroundColor Yellow
  Write-Host "       To carry it over: get the old origin back (free that port and run" -ForegroundColor Yellow
  Write-Host "       this launcher again), use the site's export-backup, then import it here." -ForegroundColor Yellow
  Write-Host ""
}

# ---------- 2) Locate Python ----------
$pyCmd = Find-PythonCmd
if (-not $pyCmd) {
  Write-Host "[ERROR] Python not found" -ForegroundColor Red
  Write-Host ""
  Write-Host "  Install Python: https://www.python.org/downloads/" -ForegroundColor Yellow
  Write-Host "  Fallback: double-click index.html (browse only)" -ForegroundColor DarkYellow
  Write-Host ""
  if ($interactive -and (-not $NoBrowser)) { Write-Host "Press any key to close..."; $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") }
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
# Only hold the window open when a human is actually there to close it;
# otherwise a double-clicked-then-scripted run would hang forever.
if ($interactive -and (-not $NoBrowser)) { Write-Host "Press any key to close..."; $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") }

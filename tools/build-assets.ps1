# ============ Build-time tool: render all raster assets from icon.svg ============
#
# Why this exists:
#   - WeChat / Facebook / X / LinkedIn do NOT accept SVG for og:image, and relative
#     og:image URLs are frequently ignored  -> sharing the link shows no preview.
#   - iOS does NOT support SVG apple-touch-icon -> "Add to Home Screen" degrades to
#     a page screenshot instead of a real icon.
#   So real PNGs are required. This script renders them with the locally installed
#   Edge / Chrome in headless mode. No third-party dependency is introduced.
#
# How it works:
#   1. icon.svg is inlined into an HTML page that fills the viewport; the SVG viewBox
#      scales it automatically, so ONE template produces every icon size.
#   2. --screenshot is used at 180 / 192 / 512 window sizes.
#   3. og:image uses a separate 1200x630 layout (Chinese text drawn with system fonts,
#      encoded as HTML numeric entities so this file stays pure ASCII).
#
# Usage (run from the project directory, i.e. the folder holding index.html):
#     pwsh -File tools/build-assets.ps1
# Output:
#     apple-touch-icon.png / og-image.png / icons/icon-{192,512,maskable-512}.png
#
# ---------------------------------------------------------------------------
# NOTE: THIS FILE IS INTENTIONALLY PURE ASCII -- DO NOT ADD NON-ASCII TEXT.
#   Windows PowerShell 5.1 reads .ps1 files using the system ANSI code page unless
#   the file carries a UTF-8 BOM. Non-ASCII inside STRING LITERALS then gets
#   mis-decoded, and a multi-byte sequence can swallow the closing quote, which
#   makes the whole script fail to parse. A UTF-8 BOM would fix it, but our editing
#   tooling strips BOMs on write, so ASCII is the only durable answer.
#   (The project's own local-server launcher script is pure ASCII for the same
#    reason; tools/fetch-vosk-model.ps1 puts Chinese inside Write-Host strings and
#    is therefore fragile under PowerShell 5.1.)
# ---------------------------------------------------------------------------
#
# NOTE: a headless browser needs named pipes for cross-process IPC. Under a
#   restricted sandbox that is denied ("Access is denied", 0x5) and the render
#   step fails. Run this script in a normal terminal in that case.

param([switch]$KeepTemp)

$ErrorActionPreference = 'Stop'

$projRoot = Split-Path -Parent $PSScriptRoot
$iconSvg  = Join-Path $projRoot 'icon.svg'

if (-not (Test-Path $iconSvg)) { throw "icon.svg not found: $iconSvg" }

# ---- Locate a browser ----
$candidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
)
$browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) {
  throw "Neither Edge nor Chrome was found. Export the PNGs manually and drop them into the project root."
}
Write-Host "Browser: $browser"

# ---- Temp workspace (use system temp: the project path contains non-ASCII chars) ----
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("fte-assets-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$fileBase = "file:///" + (($tmp -replace '\\', '/') -replace ' ', '%20')

# ---- Render templates (single-quoted here-strings: no interpolation) ----
$iconHtml = @'
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>icon</title>
<style>html,body{margin:0;padding:0;overflow:hidden;background:#2563eb}
svg{display:block;width:100vw;height:100vh}</style></head><body>
__SVG__
</body></html>
'@

$ogHtml = @'
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>og</title>
<style>
  html,body{margin:0;padding:0;overflow:hidden;width:1200px;height:630px}
  body{font-family:"Microsoft YaHei","PingFang SC","Hiragino Sans GB",sans-serif;
       background:linear-gradient(135deg,#2563eb 0%,#4f46e5 55%,#7c3aed 100%);color:#fff;position:relative}
  .glow{position:absolute;width:760px;height:760px;right:-260px;top:-330px;border-radius:50%;
        background:radial-gradient(circle,rgba(255,255,255,.20),rgba(255,255,255,0) 68%)}
  .wrap{position:absolute;left:78px;top:84px;right:78px;display:flex;align-items:center;gap:32px}
  .badge{width:130px;height:130px;border-radius:30px;background:rgba(255,255,255,.16);
         border:1px solid rgba(255,255,255,.34);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
  .badge svg{display:block}
  .kicker{font-size:25px;letter-spacing:3px;opacity:.86;font-weight:600}
  .title{font-size:86px;font-weight:800;line-height:1.08;margin-top:8px;letter-spacing:1px}
  .en{font-size:30px;opacity:.88;margin-top:10px;font-weight:500;letter-spacing:.4px}
  .rule{position:absolute;left:80px;top:340px;width:1040px;height:1px;background:rgba(255,255,255,.30)}
  .feats{position:absolute;left:80px;top:378px;right:80px;display:flex;flex-wrap:wrap;gap:11px}
  .chip{font-size:21px;font-weight:600;padding:10px 18px;border-radius:999px;
        background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.30)}
  .foot{position:absolute;left:80px;bottom:44px;right:80px;display:flex;justify-content:space-between;
        align-items:center;font-size:21px;opacity:.82}
</style></head><body>
  <div class="glow"></div>
  <div class="wrap">
    <div class="badge">__MARK__</div>
    <div>
      <div class="kicker">SOFT PACKAGING &middot; FOREIGN TRADE</div>
      <div class="title">&#36719;&#21253;&#35013;&#22806;&#36152;&#33521;&#35821;</div>
      <div class="en">Soft Packaging Foreign Trade English</div>
    </div>
  </div>
  <div class="rule"></div>
  <div class="feats">
    <span class="chip">19 &#21333;&#20803; &middot; 768 &#35789;</span>
    <span class="chip">&#36319;&#35835; &middot; &#38899;&#32032;&#35838;</span>
    <span class="chip">FSRS &#38388;&#38548;&#37325;&#22797;</span>
    <span class="chip">AI &#38506;&#32451;</span>
    <span class="chip">&#22806;&#36152;&#23454;&#25805; SOP</span>
    <span class="chip">&#31163;&#32447; PWA</span>
  </div>
  <div class="foot">
    <span>&#22797;&#21512;&#33180; &middot; &#22797;&#33180;&#33014; &middot; &#21333;&#35777; &middot; &#35746;&#33329; &middot; &#25910;&#27719;</span>
    <span>ozean01.github.io</span>
  </div>
</body></html>
'@

$svgRaw = Get-Content $iconSvg -Raw -Encoding UTF8
# Keep only the graphic part (drop the gradient backing rect) for the white badge
# used on the gradient og:image background.
$markRaw = $svgRaw -replace '(?s)<defs>.*?</defs>', '' -replace '(?s)<rect width="512" height="512"[^>]*/>', ''

Set-Content -Path (Join-Path $tmp 'icon.html') -Value ($iconHtml -replace '__SVG__', $svgRaw) -Encoding UTF8
Set-Content -Path (Join-Path $tmp 'og.html')   -Value ($ogHtml -replace '__MARK__', $markRaw) -Encoding UTF8

# ---- Render ----
$jobs = @(
  @{ f = 'icon.html'; w = 180;  h = 180; o = 'apple-touch-icon.png' },
  @{ f = 'icon.html'; w = 192;  h = 192; o = 'icon-192.png' },
  @{ f = 'icon.html'; w = 512;  h = 512; o = 'icon-512.png' },
  @{ f = 'icon.html'; w = 512;  h = 512; o = 'icon-maskable-512.png' },
  @{ f = 'og.html';   w = 1200; h = 630; o = 'og-image.png' }
)

$n = 0
foreach ($j in $jobs) {
  $n++
  $out = Join-Path $tmp $j.o
  if (Test-Path $out) { Remove-Item $out -Force }
  # Use Start-Process rather than the call operator: Edge writes harmless warnings to
  # stderr (QQBrowser / task_manager), and Windows PowerShell 5.1 turns a native
  # command's stderr into a terminating error under $ErrorActionPreference='Stop',
  # which aborted this script on the very first image.
  $bargs = @(
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    "--user-data-dir=$tmp\profile$n",
    "--window-size=$($j.w),$($j.h)",
    "--screenshot=$out",
    "$fileBase/$($j.f)"
  )
  Start-Process -FilePath $browser -ArgumentList $bargs -Wait -NoNewWindow
  if (-not (Test-Path $out)) { throw "Render failed: $($j.o)" }
}

# ---- Install into the project ----
New-Item -ItemType Directory -Force -Path (Join-Path $projRoot 'icons') | Out-Null
Copy-Item (Join-Path $tmp 'apple-touch-icon.png')  (Join-Path $projRoot 'apple-touch-icon.png') -Force
Copy-Item (Join-Path $tmp 'og-image.png')          (Join-Path $projRoot 'og-image.png') -Force
Copy-Item (Join-Path $tmp 'icon-192.png')          (Join-Path $projRoot 'icons\icon-192.png') -Force
Copy-Item (Join-Path $tmp 'icon-512.png')          (Join-Path $projRoot 'icons\icon-512.png') -Force
Copy-Item (Join-Path $tmp 'icon-maskable-512.png') (Join-Path $projRoot 'icons\icon-maskable-512.png') -Force

Add-Type -AssemblyName System.Drawing
Write-Host ""
Write-Host "Generated:"
foreach ($j in $jobs) {
  $rel = if ($j.o -like 'icon-*') { "icons\$($j.o)" } else { $j.o }
  $full = Join-Path $projRoot $rel
  $img = [System.Drawing.Image]::FromFile($full)
  Write-Host ("  {0,-30} {1,5} x {2,-4}  {3,8} bytes" -f $rel, $img.Width, $img.Height, (Get-Item $full).Length)
  $img.Dispose()
}

if (-not $KeepTemp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
Write-Host ""
Write-Host "Done. Re-run this script whenever icon.svg changes."
Write-Host "Note: og-image.png lives in the project root; index.html and sw.js reference"
Write-Host "      these filenames -- keep them in sync if you rename anything."

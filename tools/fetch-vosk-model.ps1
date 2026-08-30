# 在【你的有网机器】上一次运行：下载并解压 vosk 小模型到 models/，把 vosk.js 放到 js/vendor/。
# 之后站点即可「完全离线」使用本地语音识别（在发音设置开「本地离线识别」）。
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot   # 外贸英语/
$models = Join-Path $root 'models\vosk-model-small-en-us-0.15'
$vendor = Join-Path $root 'js\vendor'

Write-Host "== 下载 vosk-browser 库（约 100KB+）到 js/vendor/vosk.js =="
New-Item -ItemType Directory -Force -Path $vendor | Out-Null
Invoke-WebRequest -Uri 'https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js' -OutFile (Join-Path $vendor 'vosk.js') -UseBasicParsing

Write-Host "== 下载并解压 vosk-model-small-en-us-0.15（约 40MB）到 models/ =="
$zip = Join-Path $env:TEMP 'vosk-model-small-en-us-0.15.zip'
Invoke-WebRequest -Uri 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip' -OutFile $zip -UseBasicParsing
if (Test-Path $models) { Remove-Item $models -Recurse -Force }
$tmp = Join-Path $env:TEMP 'vosk-extract'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $tmp -Force
Move-Item (Join-Path $tmp 'vosk-model-small-en-us-0.15') (Join-Path $root 'models') -Force
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "✅ 完成。现在可在发音设置开启「本地离线识别」，然后回到「四维口语实战」用 🔎 或 🎯 评测即可离线。"

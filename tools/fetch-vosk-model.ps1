# 在【你的有网机器】上一次运行：下载并解压 vosk 小模型到 models/，把 vosk.js 放到 js/vendor/。
# 之后站点即可「完全离线」使用本地语音识别（在发音设置开「本地离线识别」）。
#
# ⚠️ 注意：本文件的字符串字面量必须保持 ASCII。
#   Windows PowerShell 5.1 会按系统 ANSI 代码页读取无 BOM 的 .ps1，中文字符串会被误解码，
#   多字节序列甚至可能吞掉闭合引号，导致整个脚本报「字符串缺少终止符」而无法运行
#   （本文件此前正是这个毛病）。注释里的中文没有问题，提示信息请用英文。
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$models = Join-Path $root 'models\vosk-model-small-en-us-0.15'
$vendor = Join-Path $root 'js\vendor'

Write-Host "== [1/2] Downloading vosk-browser (~100KB) to js/vendor/vosk.js =="
New-Item -ItemType Directory -Force -Path $vendor | Out-Null
Invoke-WebRequest -Uri 'https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js' -OutFile (Join-Path $vendor 'vosk.js') -UseBasicParsing

Write-Host "== [2/2] Downloading and extracting vosk-model-small-en-us-0.15 (~40MB) to models/ =="
$zip = Join-Path $env:TEMP 'vosk-model-small-en-us-0.15.zip'
Invoke-WebRequest -Uri 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip' -OutFile $zip -UseBasicParsing
if (Test-Path $models) { Remove-Item $models -Recurse -Force }
$tmp = Join-Path $env:TEMP 'vosk-extract'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $tmp -Force
Move-Item (Join-Path $tmp 'vosk-model-small-en-us-0.15') (Join-Path $root 'models') -Force
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done. Enable 'local offline recognition' in the pronunciation settings, then"
Write-Host "use the review buttons in the 4-dimension speaking page -- fully offline now."

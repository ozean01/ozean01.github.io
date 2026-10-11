# 在【你的有网机器】上一次运行：下载 vosk 小模型并打包成 models/*.tar.gz。
# 之后站点即可「完全离线」使用本地语音识别（在发音设置开「本地离线识别」）。
#
# 注意：识别引擎 js/vendor/vosk-worker.js 已随站分发，**本脚本不再下载 vosk.js**。
#   （2026-10-11 晚真机定位：dist/vosk.js 99.5% 是 base64 载荷，且它用 blob Worker，
#    会继承文档 CSP 而必然被严格 CSP 拦死；现在改由 tools/build-vosk-worker.js 抽出
#    同源 worker 文件。升级时见 js/vendor/README.md。）
#
# ⚠️ 注意：本文件的字符串字面量必须保持 ASCII。
#   Windows PowerShell 5.1 会按系统 ANSI 代码页读取无 BOM 的 .ps1，中文字符串会被误解码，
#   多字节序列甚至可能吞掉闭合引号，导致整个脚本报「字符串缺少终止符」而无法运行
#   （本文件此前正是这个毛病）。注释里的中文没有问题，提示信息请用英文。
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$models = Join-Path $root 'models\vosk-model-small-en-us-0.15'

Write-Host "== [1/3] Checking for the on-site recognition worker (js/vendor/vosk-worker.js) =="
$worker = Join-Path $root 'js\vendor\vosk-worker.js'
if (Test-Path $worker) {
  Write-Host ("   OK: " + $worker)
} else {
  Write-Host "   MISSING. Regenerating from the pinned vosk-browser bundle..."
  & node (Join-Path $PSScriptRoot 'build-vosk-worker.js')
  if (-not (Test-Path $worker)) { throw "worker file still missing: $worker" }
}

Write-Host "== [2/3] Downloading and extracting vosk-model-small-en-us-0.15 (~40MB) to models/ =="
$zip = Join-Path $env:TEMP 'vosk-model-small-en-us-0.15.zip'
Invoke-WebRequest -Uri 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip' -OutFile $zip -UseBasicParsing
if (Test-Path $models) { Remove-Item $models -Recurse -Force }
$tmp = Join-Path $env:TEMP 'vosk-extract'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $tmp -Force
Move-Item (Join-Path $tmp 'vosk-model-small-en-us-0.15') (Join-Path $root 'models') -Force
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "== [3/3] Packing model into tar.gz (vosk-browser downloads a tar.gz, NOT a directory) =="
# P1 离线识别修复（真机定位）：vosk-browser 的 worker 走 downloadAndExtract(url)：
#   fetch(url) -> downloaded.tar.gz -> ArchiveHelper.Extract(stripFirstComponent=true)
# 所以 createModel() 必须收到 .tar.gz；传解压目录会 404，且库层不把错误变成 rejection（静默挂住）。
$archive = Join-Path $root 'models\vosk-model-small-en-us-0.15.tar.gz'
if (Test-Path $archive) { Remove-Item $archive -Force }
& tar.exe -czf $archive -C (Join-Path $root 'models') 'vosk-model-small-en-us-0.15'
if (-not (Test-Path $archive)) { throw "tar.gz packing failed: $archive" }
Write-Host ("   -> " + $archive)

Write-Host ""
Write-Host "Done. Enable 'local offline recognition' in the pronunciation settings, then"
Write-Host "use the review buttons in the 4-dimension speaking page -- fully offline now."

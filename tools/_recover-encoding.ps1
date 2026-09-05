# Recover UTF-8 text corrupted by a read-as-CP936 then write-as-UTF8 cycle.
$files = @(
  'E:\deepseek harness\外贸英语\tools\gen-difficulty.js',
  'E:\deepseek harness\外贸英语\tools\normalize-ipa-am.js'
)
$utf8 = New-Object System.Text.UTF8Encoding($false)   # no BOM
$gb   = [System.Text.Encoding]::GetEncoding(936)      # CP936 (GBK)
foreach ($p in $files) {
  if (-not (Test-Path -LiteralPath $p)) { Write-Output "SKIP(missing) $p"; continue }
  $b = [System.IO.File]::ReadAllBytes($p)
  $s = $utf8.GetString($b)          # current text (as written, UTF-8)
  # Reverse double-encoding: encode as GBK -> that is the ORIGINAL utf-8 byte stream -> decode as utf-8
  $reBytes = $gb.GetBytes($s)
  $orig = $utf8.GetString($reBytes)
  [System.IO.File]::WriteAllBytes($p, $utf8.GetBytes($orig))
  Write-Output "RECOVERED $p"
}

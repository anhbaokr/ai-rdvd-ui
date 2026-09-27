param(
  [string]$SourceRoot = "E:\Vocalize-Translation-Lab",
  [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$sourceVenv = Join-Path $SourceRoot "venv"
if (-not (Test-Path (Join-Path $sourceVenv "Scripts\python.exe"))) {
  $sourceVenv = Join-Path $SourceRoot ".venv"
}
$sourcePython = Join-Path $sourceVenv "Scripts\python.exe"
$targetVenv = Join-Path $ProjectRoot ".translation-venv"
$targetPython = Join-Path $targetVenv "Scripts\python.exe"
$assets = Join-Path $ProjectRoot "translation-assets"
$worker = Join-Path $ProjectRoot "backend\translation_worker.py"
$manifestTool = Join-Path $ProjectRoot "backend\download_translation_assets.py"

if (-not (Test-Path $sourcePython)) { throw "Source translation Python not found: $sourcePython" }
if (-not (Test-Path (Join-Path $SourceRoot "models\HachimiMT-60-QT\ct2-int8_float32\model.bin"))) { throw "Source Hachimi model.bin not found." }
if (-not (Test-Path (Join-Path $SourceRoot "sources\CVDICT\CVDICT.u8"))) { throw "Source CVDICT.u8 not found." }
if (-not (Test-Path (Join-Path $SourceRoot "sources\hanviet-pinyin-wordlist\hanviet.csv"))) { throw "Source hanviet.csv not found." }

function Copy-Tree([string]$Source, [string]$Destination) {
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  & robocopy $Source $Destination /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP
  if ($LASTEXITCODE -ge 8) { throw "Robocopy failed: $Source -> $Destination (code $LASTEXITCODE)" }
}

Write-Host "[1/5] Copying isolated translation venv..."
Copy-Tree $sourceVenv $targetVenv

Write-Host "[2/5] Copying Hachimi model..."
Copy-Tree (Join-Path $SourceRoot "models\HachimiMT-60-QT") (Join-Path $assets "models\HachimiMT-60-QT")

Write-Host "[3/5] Copying dictionaries and Vocalize resources..."
Copy-Tree (Join-Path $SourceRoot "sources\CVDICT") (Join-Path $assets "sources\CVDICT")
Copy-Tree (Join-Path $SourceRoot "sources\hanviet-pinyin-wordlist") (Join-Path $assets "sources\hanviet-pinyin-wordlist")
Copy-Tree (Join-Path $SourceRoot "dictionaries") (Join-Path $assets "dictionaries")
if (Test-Path (Join-Path $SourceRoot "data")) {
  Copy-Tree (Join-Path $SourceRoot "data") (Join-Path $assets "data")
}

Write-Host "[4/5] Writing exact local inventory..."
& $targetPython $manifestTool --assets-root $assets --manifest-only --source "imported-vocalize-lab"
if ($LASTEXITCODE -ne 0) { throw "Cannot create translation asset manifest." }
& $targetPython -m pip freeze | Set-Content -Path (Join-Path $targetVenv "translation-runtime.lock.txt") -Encoding utf8

Write-Host "[5/5] Running translation health check..."
& $targetPython $worker --check --deep-check --assets-root $assets
if ($LASTEXITCODE -ne 0) { throw "Translation health check failed." }

Write-Host "Translation environment imported successfully."
Write-Host "Python: $targetPython"
Write-Host "Assets: $assets"

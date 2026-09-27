param(
  [string]$ProjectRoot = "",
  [string]$ModelRevision = "main",
  [string]$RuntimeRoot = "",
  [string]$AssetsRoot = "",
  [string]$BackendRoot = "",
  [string]$TemplateRoot = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

if ([string]::IsNullOrWhiteSpace($RuntimeRoot)) { $RuntimeRoot = $ProjectRoot }
if ([string]::IsNullOrWhiteSpace($AssetsRoot)) { $AssetsRoot = Join-Path $ProjectRoot "translation-assets" }
if ([string]::IsNullOrWhiteSpace($BackendRoot)) { $BackendRoot = Join-Path $ProjectRoot "backend" }
if ([string]::IsNullOrWhiteSpace($TemplateRoot)) { $TemplateRoot = Join-Path $ProjectRoot "translation-template" }

$venvRoot = if ($RuntimeRoot -eq $ProjectRoot) { Join-Path $ProjectRoot ".translation-venv" } else { Join-Path $RuntimeRoot ".venv" }
$python = Join-Path $venvRoot "Scripts\python.exe"
$requirements = Join-Path $BackendRoot "requirements-translation.txt"
$downloader = Join-Path $BackendRoot "download_translation_assets.py"
$worker = Join-Path $BackendRoot "translation_worker.py"
$assets = $AssetsRoot
$template = $TemplateRoot

Write-Host "[1/5] Preparing isolated translation Python..."
if (-not (Test-Path $python)) {
  $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($launcher) {
    & $launcher.Source -3.10 -m venv $venvRoot
  } else {
    $systemPython = Get-Command python.exe -ErrorAction Stop
    & $systemPython.Source -m venv $venvRoot
  }
  if ($LASTEXITCODE -ne 0) { throw "Cannot create translation venv." }
}

Write-Host "[2/5] Installing translation dependencies..."
& $python -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "Cannot upgrade pip." }
& $python -m pip install -r $requirements
if ($LASTEXITCODE -ne 0) { throw "Cannot install translation dependencies." }

Write-Host "[3/5] Downloading pinned model and dictionary snapshots..."
& $python $downloader --assets-root $assets --template-root $template --model-revision $ModelRevision --source download
if ($LASTEXITCODE -ne 0) { throw "Cannot download translation assets." }

Write-Host "[4/5] Writing dependency inventory..."
& $python -m pip freeze | Set-Content -Path (Join-Path $venvRoot "translation-runtime.lock.txt") -Encoding utf8

Write-Host "[5/5] Running translation health check..."
& $python $worker --check --deep-check --assets-root $assets
if ($LASTEXITCODE -ne 0) { throw "Translation health check failed." }

Write-Host "Translation module is ready."
Write-Host "Python: $python"
Write-Host "Assets: $assets"

[CmdletBinding()]
param(
  [string]$SourceVenv = "E:\Menu04-TTS-Test\.venv",
  [string]$ProjectRoot = "E:\ai-rdvd-ui",
  [switch]$PrepareOfflineRuntime
)

$ErrorActionPreference = "Stop"
$sourcePython = Join-Path $SourceVenv "Scripts\python.exe"
$destinationVenv = Join-Path $ProjectRoot ".venv"
$destinationPython = Join-Path $destinationVenv "Scripts\python.exe"
$requirements = Join-Path $ProjectRoot "backend\requirements-tts.txt"
$lockFile = Join-Path $ProjectRoot "backend\requirements-tts.lock.txt"

if (-not (Test-Path $sourcePython)) {
  throw "Source Python was not found: $sourcePython"
}
if (-not (Test-Path $requirements)) {
  throw "Requirements file was not found: $requirements"
}

$sourceVersion = & $sourcePython -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
if (-not (Test-Path $destinationPython)) {
  # Recreate the venv shell at its final location so pyvenv.cfg and launchers do
  # not retain E:\Menu04-TTS-Test paths.
  & $sourcePython -m venv $destinationVenv
}
$destinationVersion = & $destinationPython -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
if ($sourceVersion -ne $destinationVersion) {
  throw "Python version mismatch: source $sourceVersion, destination $destinationVersion"
}

$sourceSitePackages = & $sourcePython -c "import site; print(site.getsitepackages()[0])"
$destinationSitePackages = & $destinationPython -c "import site; print(site.getsitepackages()[0])"
New-Item -ItemType Directory -Force -Path $destinationSitePackages | Out-Null

Write-Host "Copying modules from $sourceSitePackages"
& robocopy $sourceSitePackages $destinationSitePackages /E /R:2 /W:1 /XD __pycache__ | Out-Host
if ($LASTEXITCODE -ge 8) {
  throw "TTS module copy failed. Robocopy exit code: $LASTEXITCODE"
}

& $sourcePython -m pip freeze | Set-Content -Encoding UTF8 $lockFile
& $destinationPython -m pip install --upgrade pip wheel setuptools
& $destinationPython -m pip install -r $requirements
& $destinationPython -m pip check
& $destinationPython -c "from vieneu.v3turbo import V3TurboVieNeuTTS; t=V3TurboVieNeuTTS(backend='onnx',device='cpu',dtype='fp32'); voices=t.list_preset_voices(); print('VOICE_COUNT=',len(voices)); assert len(voices) >= 23"
if ($LASTEXITCODE -ne 0) {
  throw "VieNeu voice verification failed. Exit code: $LASTEXITCODE"
}

Write-Host "TTS environment copied to $destinationVenv"
Write-Host "AI RDvD will prefer $destinationPython"

if ($PrepareOfflineRuntime) {
  $basePythonRoot = & $sourcePython -c "import sys; print(sys.base_prefix)"
  $runtimeRoot = Join-Path $ProjectRoot "runtime\python"
  $runtimeSitePackages = Join-Path $runtimeRoot "Lib\site-packages"
  New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

  Write-Host "Creating standalone Python runtime at $runtimeRoot"
  & robocopy $basePythonRoot $runtimeRoot /E /R:2 /W:1 /XD (Join-Path $basePythonRoot "Lib\site-packages") __pycache__ /XF *.pyc | Out-Host
  if ($LASTEXITCODE -ge 8) {
    throw "Offline Python runtime copy failed. Robocopy exit code: $LASTEXITCODE"
  }
  New-Item -ItemType Directory -Force -Path $runtimeSitePackages | Out-Null
  & robocopy $destinationSitePackages $runtimeSitePackages /E /R:2 /W:1 /XD __pycache__ /XF *.pyc | Out-Host
  if ($LASTEXITCODE -ge 8) {
    throw "Offline module copy failed. Robocopy exit code: $LASTEXITCODE"
  }

  $runtimePython = Join-Path $runtimeRoot "python.exe"
  & $runtimePython (Join-Path $ProjectRoot "backend\tts_worker.py") --check
  Write-Warning "Offline runtime substantially increases NSIS/MSI size. Use -PrepareOfflineRuntime only for offline builds."
}

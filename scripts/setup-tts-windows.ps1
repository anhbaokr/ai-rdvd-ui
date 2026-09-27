[CmdletBinding()]
param(
  [string]$ProjectRoot = "E:\ai-rdvd-ui",
  [string]$PythonLauncher = "py"
)

$ErrorActionPreference = "Stop"
$requirements = Join-Path $ProjectRoot "backend\requirements-tts.txt"
$venv = Join-Path $ProjectRoot ".venv"
$python = Join-Path $venv "Scripts\python.exe"

if (-not (Test-Path $requirements)) {
  throw "Requirements file was not found: $requirements. Extract the complete source to $ProjectRoot."
}

if (-not (Test-Path $python)) {
  & $PythonLauncher -3.10 -m venv $venv
}

& $python -m pip install --upgrade pip wheel setuptools
& $python -m pip install -r $requirements

$espeakCandidates = @(
  "$env:ProgramFiles\eSpeak NG\espeak-ng.exe",
  "$env:ProgramFiles\eSpeak NG\espeak-ng",
  "${env:ProgramFiles(x86)}\eSpeak NG\espeak-ng.exe"
)
if (-not ($espeakCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1)) {
  Write-Warning "eSpeak NG was not detected. Install the Windows MSI from https://github.com/espeak-ng/espeak-ng/releases if VieNeu reports a phonemizer error."
}

& $python -c "from vieneu.v3turbo import V3TurboVieNeuTTS; t=V3TurboVieNeuTTS(backend='onnx',device='cpu',dtype='fp32'); print('VOICE_COUNT=',len(t.list_preset_voices())); assert len(t.list_preset_voices()) >= 23"

Write-Host "VieNeu TTS is ready at $python"
Write-Host "Voice previews: $(Join-Path $ProjectRoot 'audio')"
Write-Host "Generated audio: $(Join-Path $ProjectRoot 'output\tts')"

param(
  [Parameter(Mandatory=$true)][string]$ProjectRoot,
  [Parameter(Mandatory=$true)][string]$PayloadRoot
)

$ErrorActionPreference = "Stop"

$items = @(
  @{ Rel="src\components\editor\EditPanel.tsx"; Label="EditPanel.tsx" },
  @{ Rel="src\components\preview\SubtitleOverlay.tsx"; Label="SubtitleOverlay.tsx" },
  @{ Rel="src\styles\preview.css"; Label="preview.css" }
)

$backupDir = Join-Path $ProjectRoot "_patch-backups\V48.1-R2"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

function SamePath([string]$a, [string]$b) {
  try {
    $fa = [IO.Path]::GetFullPath($a).TrimEnd('\')
    $fb = [IO.Path]::GetFullPath($b).TrimEnd('\')
    return [String]::Equals($fa,$fb,[StringComparison]::OrdinalIgnoreCase)
  } catch { return $false }
}

foreach ($item in $items) {
  $src = Join-Path $PayloadRoot $item.Rel
  $dst = Join-Path $ProjectRoot $item.Rel
  $bak = Join-Path $backupDir $item.Rel

  Write-Host "[PATCH] $($item.Label)"

  if (-not (Test-Path -LiteralPath $src -PathType Leaf)) {
    throw "Missing payload: $src"
  }
  if (-not (Test-Path -LiteralPath $dst -PathType Leaf)) {
    throw "Missing target: $dst"
  }

  $srcFull = [IO.Path]::GetFullPath($src)
  $dstFull = [IO.Path]::GetFullPath($dst)

  if (SamePath $srcFull $dstFull) {
    throw "Patch payload and project target resolve to the same file. Keep payload under the ZIP's payload folder."
  }

  $bakParent = Split-Path $bak -Parent
  New-Item -ItemType Directory -Force -Path $bakParent | Out-Null
  Copy-Item -LiteralPath $dst -Destination $bak -Force

  # Refuse a self-copy and make the replacement only after a backup exists.
  Copy-Item -LiteralPath $src -Destination $dst -Force
}

Write-Host "[OK] 3 files copied. Backups: $backupDir"

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$bundleRoot = Join-Path $repoRoot "src-tauri\target\release\bundle"
$nsisDir = Join-Path $bundleRoot "nsis"
$msiDir = Join-Path $bundleRoot "msi"

$nsis = @()
$msi = @()

if (Test-Path -LiteralPath $nsisDir) {
    $nsis = @(Get-ChildItem -LiteralPath $nsisDir -File -Filter *.exe | Sort-Object LastWriteTime -Descending)
}
if (Test-Path -LiteralPath $msiDir) {
    $msi = @(Get-ChildItem -LiteralPath $msiDir -File -Filter *.msi | Sort-Object LastWriteTime -Descending)
}

if ($nsis.Count -eq 0) {
    throw "Không tìm thấy NSIS installer trong $nsisDir"
}
if ($msi.Count -eq 0) {
    throw "Không tìm thấy MSI installer trong $msiDir"
}

Write-Host "=== NSIS ==="
$nsis | Select-Object FullName, Length, LastWriteTime | Format-Table -AutoSize
Write-Host ""
Write-Host "=== MSI ==="
$msi | Select-Object FullName, Length, LastWriteTime | Format-Table -AutoSize

$latestNsis = $nsis[0]
$latestMsi = $msi[0]

Write-Host ""
Write-Host "Latest NSIS size: $([Math]::Round($latestNsis.Length / 1MB, 2)) MiB"
Write-Host "Latest MSI size:  $([Math]::Round($latestMsi.Length / 1MB, 2)) MiB"
Write-Host ""
Write-Host "R7_2_WINDOWS_BUNDLES_FOUND"
Write-Host "NOTE: Presence of FFmpeg inside the INSTALLED app is verified on a clean machine in R7.3."

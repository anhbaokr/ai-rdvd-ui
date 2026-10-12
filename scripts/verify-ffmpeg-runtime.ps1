$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot "runtime\ffmpeg"
$ffmpeg = Join-Path $runtimeDir "ffmpeg.exe"
$manifestPath = Join-Path $runtimeDir "manifest.json"

if (-not (Test-Path -LiteralPath $ffmpeg -PathType Leaf)) {
    throw "R7.1 bundled FFmpeg missing: $ffmpeg. Run: npm run render:runtime:prepare"
}
$info = Get-Item -LiteralPath $ffmpeg
if ($info.Length -le 0) {
    throw "R7.1 bundled FFmpeg is empty: $ffmpeg"
}

$versionLine = (& $ffmpeg -hide_banner -version 2>&1 | Select-Object -First 1).ToString().Trim()
if ([string]::IsNullOrWhiteSpace($versionLine)) {
    throw "Bundled ffmpeg.exe không chạy được hoặc không trả version."
}

$encoders = (& $ffmpeg -hide_banner -encoders 2>&1 | Out-String)
$filters  = (& $ffmpeg -hide_banner -filters 2>&1 | Out-String)
$muxers   = (& $ffmpeg -hide_banner -muxers 2>&1 | Out-String)

$checks = [ordered]@{
    libx264 = [bool]($encoders -match '(?m)\blibx264\b')
    aac     = [bool]($encoders -match '(?m)\baac\b')
    ass     = [bool]($filters  -match '(?m)\bass\b')
    drawbox = [bool]($filters  -match '(?m)\bdrawbox\b')
    overlay = [bool]($filters  -match '(?m)\boverlay\b')
    scale2ref = [bool]($filters -match '(?m)\bscale2ref\b')
    apad    = [bool]($filters  -match '(?m)\bapad\b')
    mp4     = [bool]($muxers   -match '(?m)\bmp4\b')
}

$missing = @($checks.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
if ($missing.Count -gt 0) {
    throw "Bundled FFmpeg thiếu capability: $($missing -join ', ')"
}

$hash = (Get-FileHash -LiteralPath $ffmpeg -Algorithm SHA256).Hash
if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
    try {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        if ($manifest.sha256 -and ($manifest.sha256.ToString().ToUpperInvariant() -ne $hash.ToUpperInvariant())) {
            throw "manifest SHA256 không khớp ffmpeg.exe."
        }
    } catch {
        throw "FFmpeg manifest không hợp lệ: $($_.Exception.Message)"
    }
} else {
    throw "Thiếu runtime\ffmpeg\manifest.json. Run: npm run render:runtime:prepare"
}

Write-Host "PASS — bundled ffmpeg exists"
Write-Host "PASS — ffmpeg executable/version"
Write-Host "PASS — libx264"
Write-Host "PASS — AAC"
Write-Host "PASS — ASS/libass"
Write-Host "PASS — drawbox"
Write-Host "PASS — overlay"
Write-Host "PASS — scale2ref"
Write-Host "PASS — apad"
Write-Host "PASS — MP4 muxer"
Write-Host "PASS — SHA256 manifest"
Write-Host ""
Write-Host "R7_1_FFMPEG_RUNTIME_VERIFY_PASS"
Write-Host "Version: $versionLine"
Write-Host "SHA256: $hash"

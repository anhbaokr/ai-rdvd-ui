param(
    [switch]$Release
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot "runtime\ffmpeg"
$ffmpeg = Join-Path $runtimeDir "ffmpeg.exe"

& (Join-Path $PSScriptRoot "verify-ffmpeg-runtime.ps1")

$required = @(
    "manifest.json",
    "FFMPEG-NOTICE.txt",
    "FFMPEG-BUILD-CONFIG.txt",
    "COPYING.GPLv3.txt",
    "SOURCE-AVAILABILITY.txt",
    "CORRESPONDING-SOURCE-URL.txt"
)

foreach ($name in $required) {
    $p = Join-Path $runtimeDir $name
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) {
        throw "Packaging file missing: $p. Run: npm run render:license:prepare"
    }
    if ((Get-Item -LiteralPath $p).Length -le 0) {
        throw "Packaging file empty: $p"
    }
}

$notice = Get-Content -LiteralPath (Join-Path $runtimeDir "FFMPEG-NOTICE.txt") -Raw
$gpl = Get-Content -LiteralPath (Join-Path $runtimeDir "COPYING.GPLv3.txt") -Raw
$sourceUrl = (Get-Content -LiteralPath (Join-Path $runtimeDir "CORRESPONDING-SOURCE-URL.txt") -Raw).Trim()

if ($notice -notmatch 'GNU General Public License') {
    throw "FFMPEG-NOTICE.txt thiếu GPL notice."
}
if ($gpl -notmatch 'GNU GENERAL PUBLIC LICENSE' -or $gpl -notmatch 'Version 3') {
    throw "COPYING.GPLv3.txt không hợp lệ."
}

$ffmpegSize = (Get-Item -LiteralPath $ffmpeg).Length
$ffmpegMiB = [Math]::Round($ffmpegSize / 1MB, 2)

if ($Release) {
    if ([string]::IsNullOrWhiteSpace($sourceUrl) -or
        $sourceUrl -eq 'REPLACE_WITH_PUBLIC_URL_TO_COMPLETE_CORRESPONDING_SOURCE' -or
        $sourceUrl -notmatch '^https://') {
        throw "PUBLIC RELEASE BLOCKED: CORRESPONDING-SOURCE-URL.txt chưa có HTTPS URL thật tới complete corresponding source."
    }
    Write-Host "PASS — public corresponding-source URL configured"
} else {
    if ($sourceUrl -eq 'REPLACE_WITH_PUBLIC_URL_TO_COMPLETE_CORRESPONDING_SOURCE') {
        Write-Host "WARN — corresponding-source URL is still placeholder; local packaging is allowed, PUBLIC release is not."
    }
}

Write-Host "PASS — FFmpeg third-party notice"
Write-Host "PASS — GPLv3 text"
Write-Host "PASS — source availability notice"
Write-Host "PASS — build configuration"
Write-Host "PASS — runtime resource set"
Write-Host "FFmpeg binary size: $ffmpegMiB MiB"
Write-Host ""
if ($Release) {
    Write-Host "R7_2_RELEASE_PACKAGING_VERIFY_PASS"
} else {
    Write-Host "R7_2_LOCAL_PACKAGING_VERIFY_PASS"
}

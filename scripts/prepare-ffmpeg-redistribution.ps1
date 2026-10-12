param(
    [switch]$RefreshLicense
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot "runtime\ffmpeg"
$ffmpeg = Join-Path $runtimeDir "ffmpeg.exe"
$manifestPath = Join-Path $runtimeDir "manifest.json"

$noticePath = Join-Path $runtimeDir "FFMPEG-NOTICE.txt"
$buildConfigPath = Join-Path $runtimeDir "FFMPEG-BUILD-CONFIG.txt"
$gplPath = Join-Path $runtimeDir "COPYING.GPLv3.txt"
$sourceInfoPath = Join-Path $runtimeDir "SOURCE-AVAILABILITY.txt"
$sourceUrlPath = Join-Path $runtimeDir "CORRESPONDING-SOURCE-URL.txt"

if (-not (Test-Path -LiteralPath $ffmpeg -PathType Leaf)) {
    throw "Thiếu runtime\ffmpeg\ffmpeg.exe. Run: npm run render:runtime:prepare"
}
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Thiếu runtime\ffmpeg\manifest.json."
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$hash = (Get-FileHash -LiteralPath $ffmpeg -Algorithm SHA256).Hash
if ($manifest.sha256.ToString().ToUpperInvariant() -ne $hash.ToUpperInvariant()) {
    throw "FFmpeg SHA256 không khớp manifest R7.1."
}

$versionOutput = (& $ffmpeg -hide_banner -version 2>&1 | Out-String).Trim()
$versionLine = ($versionOutput -split "\r?\n" | Select-Object -First 1).Trim()
$licenseOutput = (& $ffmpeg -hide_banner -L 2>&1 | Out-String).Trim()
$buildConfOutput = (& $ffmpeg -hide_banner -buildconf 2>&1 | Out-String).Trim()

if ($licenseOutput -notmatch 'GNU General Public License') {
    throw "Binary hiện tại không tự khai báo GNU General Public License; dừng để kiểm tra thủ công."
}
if ($buildConfOutput -notmatch '(?m)^\s*--enable-gpl\s*$' -and $buildConfOutput -notmatch '--enable-gpl') {
    throw "Không thấy --enable-gpl trong build configuration."
}
if ($buildConfOutput -notmatch '(?m)^\s*--enable-version3\s*$' -and $buildConfOutput -notmatch '--enable-version3') {
    throw "Không thấy --enable-version3 trong build configuration."
}

$size = (Get-Item -LiteralPath $ffmpeg).Length
$sizeMiB = [Math]::Round($size / 1MB, 2)

$notice = @"
AI RDvD — Third-Party Notice: FFmpeg
====================================

Component: FFmpeg
Bundled binary: runtime\ffmpeg\ffmpeg.exe
Binary version:
$versionLine

Binary SHA256:
$hash

Binary size:
$size bytes ($sizeMiB MiB)

Provider/build:
Gyan Windows FFmpeg builds
https://www.gyan.dev/ffmpeg/builds/

FFmpeg project:
https://ffmpeg.org/

License detected from the bundled binary:
GNU General Public License, version 3 or later.

The bundled binary reports --enable-gpl and --enable-version3.
The exact build configuration is stored in FFMPEG-BUILD-CONFIG.txt.

AI RDvD invokes FFmpeg as a separate executable for local render/export.
This notice documents the third-party binary being distributed. It is not a
substitute for legal review or for satisfying source-code distribution duties.

The GNU GPLv3 text is stored in COPYING.GPLv3.txt.
Source/provenance information is stored in SOURCE-AVAILABILITY.txt.
Before a PUBLIC release, CORRESPONDING-SOURCE-URL.txt must point to a public
location that provides the complete corresponding source for the exact binary
being distributed, including the source needed for statically linked covered
components and build information as applicable.

Generated from the exact bundled binary by scripts\prepare-ffmpeg-redistribution.ps1.
"@

$sourceInfo = @"
FFmpeg Source / Redistribution Information
==========================================

Bundled version:
$versionLine

SHA256:
$hash

Build provider:
https://www.gyan.dev/ffmpeg/builds/

FFmpeg licensing/legal information:
https://ffmpeg.org/legal.html

FFmpeg release source index:
https://ffmpeg.org/releases/

GNU GPLv3:
https://www.gnu.org/licenses/gpl-3.0.html

IMPORTANT FOR PUBLIC DISTRIBUTION
---------------------------------
The current Windows binary is a static GPLv3 build with multiple external
libraries. A link to the FFmpeg project's main source archive alone may not be
sufficient to satisfy all obligations for the exact static binary.

Before public release, prepare/host the complete corresponding source and build
information appropriate to the exact binary being distributed, then put that
public URL in CORRESPONDING-SOURCE-URL.txt.

The release verification command intentionally blocks a release while that file
contains the placeholder value.

This file is operational packaging guidance, not legal advice.
"@

$buildText = @"
AI RDvD bundled FFmpeg build configuration
===========================================

Version:
$versionLine

SHA256:
$hash

Captured output:
$buildConfOutput
"@

$notice | Set-Content -LiteralPath $noticePath -Encoding UTF8
$sourceInfo | Set-Content -LiteralPath $sourceInfoPath -Encoding UTF8
$buildText | Set-Content -LiteralPath $buildConfigPath -Encoding UTF8

if (-not (Test-Path -LiteralPath $sourceUrlPath -PathType Leaf)) {
    "REPLACE_WITH_PUBLIC_URL_TO_COMPLETE_CORRESPONDING_SOURCE" |
        Set-Content -LiteralPath $sourceUrlPath -Encoding ASCII
    Write-Host "[R7.2] Created source URL placeholder."
} else {
    Write-Host "[R7.2] Kept existing CORRESPONDING-SOURCE-URL.txt."
}

if ($RefreshLicense -or -not (Test-Path -LiteralPath $gplPath -PathType Leaf)) {
    $licenseUrl = "https://www.gnu.org/licenses/gpl-3.0.txt"
    Write-Host "[R7.2] Downloading official GPLv3 text from GNU..."
    Invoke-WebRequest -UseBasicParsing -Uri $licenseUrl -OutFile $gplPath
}

$gplText = Get-Content -LiteralPath $gplPath -Raw
if ($gplText -notmatch 'GNU GENERAL PUBLIC LICENSE' -or $gplText -notmatch 'Version 3') {
    throw "COPYING.GPLv3.txt không có nội dung GPLv3 hợp lệ."
}

Write-Host ""
Write-Host "R7_2_FFMPEG_REDISTRIBUTION_FILES_PREPARED"
Write-Host "PASS — FFMPEG-NOTICE.txt"
Write-Host "PASS — FFMPEG-BUILD-CONFIG.txt"
Write-Host "PASS — COPYING.GPLv3.txt"
Write-Host "PASS — SOURCE-AVAILABILITY.txt"
Write-Host "CHECK — CORRESPONDING-SOURCE-URL.txt must be replaced before PUBLIC release"
Write-Host "FFmpeg size: $sizeMiB MiB"

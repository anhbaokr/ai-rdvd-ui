param(
    [string]$Source = ""
)

$ErrorActionPreference = "Stop"

function Resolve-ExecutableFile {
    param([Parameter(Mandatory=$true)][string]$Path)

    $item = Get-Item -LiteralPath $Path -Force
    $guard = 0
    while ($item.LinkType -and $item.Target -and $guard -lt 8) {
        $target = @($item.Target)[0]
        if (-not [System.IO.Path]::IsPathRooted($target)) {
            $target = Join-Path $item.DirectoryName $target
        }
        $item = Get-Item -LiteralPath $target -Force
        $guard++
    }

    if ($item.PSIsContainer) {
        throw "FFmpeg source resolves to a directory, not a file: $Path"
    }
    return $item.FullName
}

if ([string]::IsNullOrWhiteSpace($Source)) {
    $command = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "Không tìm thấy ffmpeg.exe trong PATH. Hãy cài FFmpeg dev hoặc chạy script với -Source <đường_dẫn_ffmpeg.exe>."
    }
    $Source = $command.Source
}

$resolvedSource = Resolve-ExecutableFile -Path $Source
if (-not (Test-Path -LiteralPath $resolvedSource -PathType Leaf)) {
    throw "Không tìm thấy FFmpeg source: $resolvedSource"
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot "runtime\ffmpeg"
$destination = Join-Path $runtimeDir "ffmpeg.exe"
$manifestPath = Join-Path $runtimeDir "manifest.json"

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

$sourceHash = (Get-FileHash -LiteralPath $resolvedSource -Algorithm SHA256).Hash

if (Test-Path -LiteralPath $destination -PathType Leaf) {
    $existingHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
    if ($existingHash -eq $sourceHash) {
        Write-Host "[R7.1] Bundled ffmpeg.exe already matches source SHA256."
    } else {
        Copy-Item -LiteralPath $resolvedSource -Destination $destination -Force
        Write-Host "[R7.1] Replaced bundled ffmpeg.exe."
    }
} else {
    Copy-Item -LiteralPath $resolvedSource -Destination $destination -Force
    Write-Host "[R7.1] Copied bundled ffmpeg.exe."
}

$versionLine = (& $destination -hide_banner -version 2>&1 | Select-Object -First 1).ToString().Trim()
if ([string]::IsNullOrWhiteSpace($versionLine)) {
    throw "Bundled ffmpeg.exe không trả version."
}

$encoders = (& $destination -hide_banner -encoders 2>&1 | Out-String)
$filters  = (& $destination -hide_banner -filters 2>&1 | Out-String)
$muxers   = (& $destination -hide_banner -muxers 2>&1 | Out-String)

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
    Remove-Item -LiteralPath $destination -Force -ErrorAction SilentlyContinue
    throw "FFmpeg không đủ capability cho AI RDvD: $($missing -join ', ')"
}

$finalHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
$manifest = [ordered]@{
    schemaVersion = 1
    runtime = "ffmpeg"
    file = "ffmpeg.exe"
    version = $versionLine
    sha256 = $finalHash
    capabilities = $checks
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Host ""
Write-Host "R7_1_FFMPEG_RUNTIME_PREPARED"
Write-Host "Path: $destination"
Write-Host "Version: $versionLine"
Write-Host "SHA256: $finalHash"
Write-Host "Capabilities: PASS"
Write-Host ""
Write-Host "NOTE: Production redistribution/licensing notices for the chosen FFmpeg build are handled in R7.2."

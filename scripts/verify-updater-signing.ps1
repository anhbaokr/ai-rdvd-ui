$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY)) {
    throw "PUBLIC RELEASE BLOCKED: TAURI_SIGNING_PRIVATE_KEY is not set."
}

Write-Host "PASS — TAURI_SIGNING_PRIVATE_KEY is configured"
if ($null -ne $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
    Write-Host "INFO — TAURI_SIGNING_PRIVATE_KEY_PASSWORD environment variable is present"
} else {
    Write-Host "INFO — TAURI_SIGNING_PRIVATE_KEY_PASSWORD is not set; this is valid only for a passwordless private key"
}

Write-Host ""
Write-Host "R7_2_3_UPDATER_SIGNING_VERIFY_PASS"

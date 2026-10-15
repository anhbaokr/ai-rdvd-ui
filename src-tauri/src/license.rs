use crate::dpapi::{is_protected_value, protect_string, unprotect_string};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf, process::Command, sync::OnceLock};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineIdentity {
    pub machine_id: String,
    pub scheme: String,
}

fn read_machine_guid() -> Result<String, String> {
    #[cfg(windows)]
    {
        let output = Command::new("reg")
            .args([
                "query",
                r"HKLM\SOFTWARE\Microsoft\Cryptography",
                "/v",
                "MachineGuid",
            ])
            .output()
            .map_err(|error| format!("Không đọc được Windows MachineGuid: {error}"))?;

        if !output.status.success() {
            return Err("Windows không trả về MachineGuid.".to_owned());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if let Some((_, value)) = line.split_once("REG_SZ") {
                let value = value.trim();
                if !value.is_empty() {
                    return Ok(value.to_ascii_lowercase());
                }
            }
        }

        Err("Không tìm thấy MachineGuid trong Windows Registry.".to_owned())
    }

    #[cfg(not(windows))]
    {
        std::env::var("HOSTNAME")
            .or_else(|_| std::env::var("COMPUTERNAME"))
            .map_err(|_| "Không xác định được hostname của máy.".to_owned())
    }
}


static MACHINE_ID_CACHE: OnceLock<String> = OnceLock::new();
static DEVICE_FINGERPRINT_CACHE: OnceLock<String> = OnceLock::new();

fn license_sha256_hex(value: &str) -> String {
    Sha256::digest(value.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
}

fn normalize_hardware_fingerprint_source(raw: &str) -> String {
    raw.split('|')
        .filter_map(|item| {
            let item = item.trim().to_ascii_lowercase();
            let (label, value) = item.split_once('=')?;
            let value = value.split_whitespace().collect::<Vec<_>>().join(" ");

            if value.is_empty() {
                return None;
            }

            let rejected = [
                "to be filled by o.e.m.",
                "default string",
                "system serial number",
                "unknown",
                "none",
                "not specified",
                "00000000-0000-0000-0000-000000000000",
            ];

            if rejected.iter().any(|candidate| value == *candidate) {
                return None;
            }

            Some(format!("{}={}", label.trim(), value))
        })
        .collect::<Vec<_>>()
        .join("|")
}

#[cfg(windows)]
fn read_hardware_fingerprint_source() -> Result<String, String> {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$parts = @()
$v = (Get-CimInstance Win32_ComputerSystemProduct | Select-Object -First 1 -ExpandProperty UUID)
if ($v) { $parts += ('uuid=' + [string]$v) }
$v = (Get-CimInstance Win32_BaseBoard | Select-Object -First 1 -ExpandProperty SerialNumber)
if ($v) { $parts += ('board=' + [string]$v) }
$v = (Get-CimInstance Win32_BIOS | Select-Object -First 1 -ExpandProperty SerialNumber)
if ($v) { $parts += ('bios=' + [string]$v) }
$v = (Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty ProcessorId)
if ($v) { $parts += ('cpu=' + [string]$v) }
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::Write(($parts -join '|'))
"#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .map_err(|error| format!("Không đọc được hardware fingerprint: {error}"))?;

    if !output.status.success() {
        return Err("Windows không trả về hardware fingerprint.".to_owned());
    }

    let source = String::from_utf8_lossy(&output.stdout).trim().to_owned();

    if source.is_empty() {
        return Err("Hardware fingerprint rỗng.".to_owned());
    }

    Ok(source)
}

#[cfg(not(windows))]
fn read_hardware_fingerprint_source() -> Result<String, String> {
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .map(|value| format!("host={value}"))
        .map_err(|_| "Không xác định được hardware fingerprint.".to_owned())
}

pub(crate) fn machine_id_value() -> Result<String, String> {
    if let Some(value) = MACHINE_ID_CACHE.get() {
        return Ok(value.clone());
    }

    let source = read_machine_guid()?;
    let canonical = format!("AI-RDvD|machine_id_v1|{source}");
    let digest = license_sha256_hex(&canonical);
    let value = format!("machine_id_v1_{digest}");

    let _ = MACHINE_ID_CACHE.set(value.clone());
    Ok(value)
}

pub(crate) fn device_fingerprint_value() -> Result<String, String> {
    if let Some(value) = DEVICE_FINGERPRINT_CACHE.get() {
        return Ok(value.clone());
    }

    let hardware_source = match read_hardware_fingerprint_source() {
        Ok(value) => value,
        Err(_) => format!("machine_guid={}", read_machine_guid()?),
    };

    let mut normalized = normalize_hardware_fingerprint_source(&hardware_source);

    if normalized.is_empty() {
        normalized = format!("machine_guid={}", read_machine_guid()?);
    }

    let canonical = format!("AI-RDvD|device_fingerprint_v1|{normalized}");
    let digest = license_sha256_hex(&canonical);
    let value = format!("device_fp_v1_{digest}");

    let _ = DEVICE_FINGERPRINT_CACHE.set(value.clone());
    Ok(value)
}

const LICENSE_STATE_SCHEMA: u32 = 3;
const LEGACY_LICENSE_STATE_SCHEMA_V1: u32 = 1;
const LEGACY_LICENSE_STATE_SCHEMA_V2: u32 = 2;
const LICENSE_STATE_FILE: &str = "license-state.json";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLicenseState {
    pub schema_version: u32,
    pub license_token: String,
    #[serde(default)]
    pub machine_id: Option<String>,
    #[serde(default)]
    pub license: Option<Value>,
}

fn license_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Không xác định được thư mục dữ liệu ứng dụng: {error}"))?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Không tạo được thư mục dữ liệu ứng dụng {}: {error}", directory.display()))?;
    Ok(directory.join(LICENSE_STATE_FILE))
}

fn validate_license_token(token: &str) -> Result<String, String> {
    let value = token.trim();
    if value.is_empty() {
        return Err("License token không được để trống.".to_owned());
    }
    if value.len() > 256 || !value.is_ascii() {
        return Err("License token không hợp lệ.".to_owned());
    }
    Ok(value.to_owned())
}

fn validate_machine_id(machine_id: &str) -> Result<String, String> {
    let value = machine_id.trim();
    if value.is_empty() || value.len() > 256 || !value.is_ascii() {
        return Err("Machine ID không hợp lệ.".to_owned());
    }
    Ok(value.to_owned())
}

fn decode_disk_license_token(value: &str) -> Result<(String, bool), String> {
    let raw = value.trim();
    if raw.is_empty() {
        return Err("License token không được để trống.".to_owned());
    }

    if is_protected_value(raw) {
        let plaintext = unprotect_string(raw)?;
        return Ok((validate_license_token(&plaintext)?, false));
    }

    Ok((validate_license_token(raw)?, true))
}

fn write_license_state_file(path: &PathBuf, state: &LocalLicenseState) -> Result<(), String> {
    let json = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Không mã hóa được trạng thái license: {error}"))?;
    fs::write(path, format!("{json}\n"))
        .map_err(|error| format!("Không lưu được trạng thái license {}: {error}", path.display()))
}

fn migrate_license_state(
    path: &PathBuf,
    state: &LocalLicenseState,
    plaintext_token: &str,
) -> Result<(), String> {
    let mut migrated = state.clone();
    migrated.schema_version = LICENSE_STATE_SCHEMA;
    migrated.license_token = protect_string(plaintext_token)?;
    write_license_state_file(path, &migrated)
}

#[tauri::command]
pub fn get_machine_id() -> Result<MachineIdentity, String> {
    Ok(MachineIdentity {
        machine_id: machine_id_value()?,
        scheme: "machine_id_v1".to_owned(),
    })
}

#[tauri::command]
pub fn verify_offline_entitlement(
    app: AppHandle,
    entitlement: Value,
) -> Result<crate::offline_entitlement::OfflineEntitlementVerification, String> {
    let machine_id = machine_id_value()?;
    let device_fingerprint = device_fingerprint_value()?;
    let guarded_now_ms = crate::trusted_time::guarded_now_ms(&app)?;

    let verification = crate::offline_entitlement::verify_offline_entitlement_at(
        entitlement,
        &machine_id,
        &device_fingerprint,
        guarded_now_ms,
    )?;

    crate::trusted_time::observe_verified_now(&app, guarded_now_ms)?;
    Ok(verification)
}

#[tauri::command]
pub fn get_local_license_state(app: AppHandle) -> Result<Option<LocalLicenseState>, String> {
    let path = license_state_path(&app)?;
    if !path.is_file() {
        return Ok(None);
    }

    let text = fs::read_to_string(&path)
        .map_err(|error| format!("Không đọc được trạng thái license {}: {error}", path.display()))?;
    let state = serde_json::from_str::<LocalLicenseState>(&text)
        .map_err(|error| format!("Trạng thái license lưu cục bộ không hợp lệ: {error}"))?;

    if state.schema_version != LICENSE_STATE_SCHEMA
        && state.schema_version != LEGACY_LICENSE_STATE_SCHEMA_V1
        && state.schema_version != LEGACY_LICENSE_STATE_SCHEMA_V2
    {
        return Err(format!(
            "Phiên bản trạng thái license không được hỗ trợ: {}.",
            state.schema_version
        ));
    }

    let (token, token_needs_migration) = decode_disk_license_token(&state.license_token)?;

    let machine_id = match state.machine_id.as_deref() {
        Some(value) => Some(validate_machine_id(value)?),
        None => None,
    };

    if token_needs_migration || state.schema_version != LICENSE_STATE_SCHEMA {
        migrate_license_state(&path, &state, &token)?;
    }

    Ok(Some(LocalLicenseState {
        schema_version: LICENSE_STATE_SCHEMA,
        license_token: token,
        machine_id,
        license: state.license,
    }))
}

#[tauri::command]
pub fn save_license_state(
    app: AppHandle,
    license_token: String,
    machine_id: String,
    license: Value,
) -> Result<(), String> {
    let token = validate_license_token(&license_token)?;
    let machine = validate_machine_id(&machine_id)?;

    if license.is_null() || !license.is_object() {
        return Err("Snapshot License local không hợp lệ.".to_owned());
    }

    let path = license_state_path(&app)?;
    let state = LocalLicenseState {
        schema_version: LICENSE_STATE_SCHEMA,
        license_token: protect_string(&token)?,
        machine_id: Some(machine),
        license: Some(license),
    };
    write_license_state_file(&path, &state)
}

#[tauri::command]
pub fn save_license_token(app: AppHandle, license_token: String) -> Result<(), String> {
    let token = validate_license_token(&license_token)?;
    let path = license_state_path(&app)?;
    let state = LocalLicenseState {
        schema_version: LICENSE_STATE_SCHEMA,
        license_token: protect_string(&token)?,
        machine_id: None,
        license: None,
    };
    write_license_state_file(&path, &state)
}

#[tauri::command]
pub fn clear_license_token(app: AppHandle) -> Result<(), String> {
    let path = license_state_path(&app)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Không xóa được trạng thái license {}: {error}", path.display())),
    }
}

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf, process::Command};
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

const LICENSE_STATE_SCHEMA: u32 = 2;
const LEGACY_LICENSE_STATE_SCHEMA: u32 = 1;
const LICENSE_STATE_FILE: &str = "license-state.json";

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLicenseState {
    pub schema_version: u32,
    pub license_token: String,
    #[serde(default)]
    pub machine_id: Option<String>,
    #[serde(default)]
    pub last_verified_at_ms: Option<u64>,
    #[serde(default)]
    pub offline_grace_until_ms: Option<u64>,
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

#[tauri::command]
pub fn get_machine_id() -> Result<MachineIdentity, String> {
    let source = read_machine_guid()?;
    let canonical = format!("AI-RDvD|machine_id_v1|{source}");
    let digest = Sha256::digest(canonical.as_bytes());
    let machine_id = digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();

    Ok(MachineIdentity {
        machine_id: format!("machine_id_v1_{machine_id}"),
        scheme: "machine_id_v1".to_owned(),
    })
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

    if state.schema_version != LICENSE_STATE_SCHEMA && state.schema_version != LEGACY_LICENSE_STATE_SCHEMA {
        return Err(format!(
            "Phiên bản trạng thái license không được hỗ trợ: {}.",
            state.schema_version
        ));
    }

    let token = validate_license_token(&state.license_token)?;
    let machine_id = match state.machine_id.as_deref() {
        Some(value) => Some(validate_machine_id(value)?),
        None => None,
    };

    Ok(Some(LocalLicenseState {
        schema_version: state.schema_version,
        license_token: token,
        machine_id,
        last_verified_at_ms: state.last_verified_at_ms,
        offline_grace_until_ms: state.offline_grace_until_ms,
        license: state.license,
    }))
}

#[tauri::command]
pub fn save_license_state(
    app: AppHandle,
    license_token: String,
    machine_id: String,
    last_verified_at_ms: u64,
    offline_grace_until_ms: u64,
    license: Value,
) -> Result<(), String> {
    let token = validate_license_token(&license_token)?;
    let machine = validate_machine_id(&machine_id)?;

    if last_verified_at_ms == 0 || offline_grace_until_ms <= last_verified_at_ms {
        return Err("Mốc thời gian license local không hợp lệ.".to_owned());
    }

    if license.is_null() || !license.is_object() {
        return Err("Snapshot License local không hợp lệ.".to_owned());
    }

    let path = license_state_path(&app)?;
    let state = LocalLicenseState {
        schema_version: LICENSE_STATE_SCHEMA,
        license_token: token,
        machine_id: Some(machine),
        last_verified_at_ms: Some(last_verified_at_ms),
        offline_grace_until_ms: Some(offline_grace_until_ms),
        license: Some(license),
    };
    let json = serde_json::to_string_pretty(&state)
        .map_err(|error| format!("Không mã hóa được trạng thái license: {error}"))?;
    fs::write(&path, format!("{json}\n"))
        .map_err(|error| format!("Không lưu được trạng thái license {}: {error}", path.display()))
}

#[tauri::command]
pub fn save_license_token(app: AppHandle, license_token: String) -> Result<(), String> {
    let token = validate_license_token(&license_token)?;
    let path = license_state_path(&app)?;
    let state = LocalLicenseState {
        schema_version: LICENSE_STATE_SCHEMA,
        license_token: token,
        machine_id: None,
        last_verified_at_ms: None,
        offline_grace_until_ms: None,
        license: None,
    };
    let json = serde_json::to_string_pretty(&state)
        .map_err(|error| format!("Không mã hóa được trạng thái license: {error}"))?;
    fs::write(&path, format!("{json}\n"))
        .map_err(|error| format!("Không lưu được trạng thái license {}: {error}", path.display()))
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

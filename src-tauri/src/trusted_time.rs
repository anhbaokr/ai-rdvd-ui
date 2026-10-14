use crate::dpapi::{is_protected_value, protect_string, unprotect_string};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const TRUSTED_TIME_STATE_FILE: &str = "trusted-time-state.json";
const TRUSTED_TIME_STATE_SCHEMA: u32 = 1;
const TRUSTED_TIME_PAYLOAD_VERSION: u32 = 1;
const CLOCK_ROLLBACK_TOLERANCE_MS: u64 = 5 * 60 * 1000;
const MAX_TRUSTED_TIME_STATE_BYTES: u64 = 64 * 1024;

static TRUSTED_TIME_IO_LOCK: Mutex<()> = Mutex::new(());
static PROCESS_TIME_ANCHOR: OnceLock<ProcessTimeAnchor> = OnceLock::new();

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrustedTimeDiskState {
    schema_version: u32,
    protected_state: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrustedTimePayload {
    version: u32,
    max_trusted_time_ms: u64,
    last_server_time_ms: u64,
}

#[derive(Debug)]
struct ProcessTimeAnchor {
    floor_ms: u64,
    started: Instant,
}

fn current_system_time_ms() -> Result<u64, String> {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Đồng hồ hệ thống nằm trước UNIX epoch.".to_owned())?;

    u64::try_from(elapsed.as_millis())
        .map_err(|_| "Mốc thời gian hệ thống vượt giới hạn hỗ trợ.".to_owned())
}

fn trusted_time_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Không xác định được thư mục dữ liệu ứng dụng: {error}"))?;

    fs::create_dir_all(&directory).map_err(|error| {
        format!(
            "Không tạo được thư mục dữ liệu ứng dụng {}: {error}",
            directory.display()
        )
    })?;

    Ok(directory.join(TRUSTED_TIME_STATE_FILE))
}

fn read_state_unlocked(app: &AppHandle) -> Result<Option<TrustedTimePayload>, String> {
    let path = trusted_time_state_path(app)?;
    if !path.is_file() {
        return Ok(None);
    }

    let metadata = fs::metadata(&path)
        .map_err(|error| format!("Không đọc được metadata trusted time {}: {error}", path.display()))?;

    if metadata.len() == 0 || metadata.len() > MAX_TRUSTED_TIME_STATE_BYTES {
        return Err("TRUSTED_TIME_STATE_INVALID: Kích thước trusted-time-state không hợp lệ.".to_owned());
    }

    let text = fs::read_to_string(&path)
        .map_err(|error| format!("Không đọc được trusted time {}: {error}", path.display()))?;
    let disk = serde_json::from_str::<TrustedTimeDiskState>(&text)
        .map_err(|error| format!("TRUSTED_TIME_STATE_INVALID: JSON trusted time không hợp lệ: {error}"))?;

    if disk.schema_version != TRUSTED_TIME_STATE_SCHEMA {
        return Err(format!(
            "TRUSTED_TIME_STATE_INVALID: Schema trusted time không được hỗ trợ: {}.",
            disk.schema_version
        ));
    }

    if !is_protected_value(&disk.protected_state) {
        return Err("TRUSTED_TIME_STATE_INVALID: Trusted time không được DPAPI bảo vệ.".to_owned());
    }

    let plaintext = unprotect_string(&disk.protected_state)
        .map_err(|error| format!("TRUSTED_TIME_STATE_INVALID: Không giải mã được trusted time: {error}"))?;
    let payload = serde_json::from_str::<TrustedTimePayload>(&plaintext)
        .map_err(|error| format!("TRUSTED_TIME_STATE_INVALID: Payload trusted time không hợp lệ: {error}"))?;

    if payload.version != TRUSTED_TIME_PAYLOAD_VERSION
        || payload.max_trusted_time_ms == 0
        || payload.last_server_time_ms == 0
        || payload.max_trusted_time_ms < payload.last_server_time_ms
    {
        return Err("TRUSTED_TIME_STATE_INVALID: Giá trị trusted time không hợp lệ.".to_owned());
    }

    Ok(Some(payload))
}

fn write_state_unlocked(app: &AppHandle, payload: &TrustedTimePayload) -> Result<(), String> {
    if payload.version != TRUSTED_TIME_PAYLOAD_VERSION
        || payload.max_trusted_time_ms == 0
        || payload.last_server_time_ms == 0
        || payload.max_trusted_time_ms < payload.last_server_time_ms
    {
        return Err("Không thể lưu trusted time với giá trị không hợp lệ.".to_owned());
    }

    let plaintext = serde_json::to_string(payload)
        .map_err(|error| format!("Không serialize được trusted time payload: {error}"))?;
    let protected_state = protect_string(&plaintext)
        .map_err(|error| format!("Không bảo vệ được trusted time bằng DPAPI: {error}"))?;
    let disk = TrustedTimeDiskState {
        schema_version: TRUSTED_TIME_STATE_SCHEMA,
        protected_state,
    };
    let json = serde_json::to_string_pretty(&disk)
        .map_err(|error| format!("Không serialize được trusted time state: {error}"))?;
    let path = trusted_time_state_path(app)?;

    fs::write(&path, format!("{json}\n"))
        .map_err(|error| format!("Không lưu được trusted time {}: {error}", path.display()))
}

fn process_floor_ms(seed_ms: u64) -> u64 {
    let anchor = PROCESS_TIME_ANCHOR.get_or_init(|| ProcessTimeAnchor {
        floor_ms: seed_ms,
        started: Instant::now(),
    });
    let elapsed_ms = u64::try_from(anchor.started.elapsed().as_millis()).unwrap_or(u64::MAX);
    anchor.floor_ms.saturating_add(elapsed_ms)
}

fn evaluate_guarded_now(
    wall_clock_ms: u64,
    persisted_floor_ms: u64,
    process_floor_ms: u64,
) -> Result<u64, String> {
    let trusted_floor_ms = persisted_floor_ms.max(process_floor_ms);

    if wall_clock_ms.saturating_add(CLOCK_ROLLBACK_TOLERANCE_MS) < trusted_floor_ms {
        return Err(format!(
            "CLOCK_ROLLBACK_DETECTED: Đồng hồ Windows đang lùi quá giới hạn {} phút so với mốc thời gian tin cậy. Hãy bật mạng, đồng bộ ngày giờ Windows rồi thử lại.",
            CLOCK_ROLLBACK_TOLERANCE_MS / 60_000
        ));
    }

    Ok(wall_clock_ms.max(trusted_floor_ms))
}

pub(crate) fn observe_server_time(app: &AppHandle, server_time_ms: u64) -> Result<(), String> {
    if server_time_ms == 0 {
        return Err("Trusted server time không hợp lệ.".to_owned());
    }

    let _guard = TRUSTED_TIME_IO_LOCK
        .lock()
        .map_err(|_| "Trusted time lock bị poison.".to_owned())?;

    // A fresh HTTPS/server observation is allowed to heal a missing/corrupt
    // local trusted-time cache. It can only move the trusted floor forward.
    let existing = read_state_unlocked(app).ok().flatten();
    let previous_max = existing
        .as_ref()
        .map(|state| state.max_trusted_time_ms)
        .unwrap_or(0);
    let previous_server = existing
        .as_ref()
        .map(|state| state.last_server_time_ms)
        .unwrap_or(0);

    let payload = TrustedTimePayload {
        version: TRUSTED_TIME_PAYLOAD_VERSION,
        max_trusted_time_ms: previous_max.max(server_time_ms),
        last_server_time_ms: previous_server.max(server_time_ms),
    };

    write_state_unlocked(app, &payload)
}

pub(crate) fn guarded_now_ms(app: &AppHandle) -> Result<u64, String> {
    let payload = {
        let _guard = TRUSTED_TIME_IO_LOCK
            .lock()
            .map_err(|_| "Trusted time lock bị poison.".to_owned())?;

        read_state_unlocked(app)?
    }
    .ok_or_else(|| {
        "TRUSTED_TIME_REFRESH_REQUIRED: Chưa có mốc thời gian tin cậy. Hãy kết nối Internet một lần để xác thực bản quyền."
            .to_owned()
    })?;

    let wall_clock_ms = current_system_time_ms()?;
    let persisted_floor_ms = payload
        .max_trusted_time_ms
        .max(payload.last_server_time_ms);
    let process_floor_ms = process_floor_ms(wall_clock_ms.max(persisted_floor_ms));

    evaluate_guarded_now(wall_clock_ms, persisted_floor_ms, process_floor_ms)
}

pub(crate) fn observe_verified_now(app: &AppHandle, verified_now_ms: u64) -> Result<(), String> {
    if verified_now_ms == 0 {
        return Err("Trusted verified time không hợp lệ.".to_owned());
    }

    let _guard = TRUSTED_TIME_IO_LOCK
        .lock()
        .map_err(|_| "Trusted time lock bị poison.".to_owned())?;

    let existing = read_state_unlocked(app)?.ok_or_else(|| {
        "TRUSTED_TIME_REFRESH_REQUIRED: Không thể cập nhật trusted time khi chưa có server anchor."
            .to_owned()
    })?;

    let payload = TrustedTimePayload {
        version: TRUSTED_TIME_PAYLOAD_VERSION,
        max_trusted_time_ms: existing.max_trusted_time_ms.max(verified_now_ms),
        last_server_time_ms: existing.last_server_time_ms,
    };

    write_state_unlocked(app, &payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normal_forward_time_is_accepted() {
        let result = evaluate_guarded_now(1_000_000, 900_000, 950_000)
            .expect("forward time should pass");
        assert_eq!(result, 1_000_000);
    }

    #[test]
    fn small_backward_adjustment_is_tolerated_without_moving_time_back() {
        let floor = 10_000_000;
        let wall = floor - (CLOCK_ROLLBACK_TOLERANCE_MS / 2);
        let result = evaluate_guarded_now(wall, floor, floor)
            .expect("small clock adjustment should be tolerated");
        assert_eq!(result, floor);
    }

    #[test]
    fn large_clock_rollback_is_rejected() {
        let floor = 10_000_000;
        let wall = floor - CLOCK_ROLLBACK_TOLERANCE_MS - 1;
        let error = evaluate_guarded_now(wall, floor, floor)
            .expect_err("large rollback must fail");
        assert!(error.contains("CLOCK_ROLLBACK_DETECTED"));
    }
}

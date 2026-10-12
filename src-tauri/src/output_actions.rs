use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(windows)]
use core::ffi::c_void;
#[cfg(windows)]
use std::ffi::OsStr;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;

#[cfg(windows)]
#[link(name = "shell32")]
unsafe extern "system" {
    fn ShellExecuteW(
        hwnd: *mut c_void,
        lp_operation: *const u16,
        lp_file: *const u16,
        lp_parameters: *const u16,
        lp_directory: *const u16,
        n_show_cmd: i32,
    ) -> isize;
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputActionResult {
    status: String,
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputActionError {
    code: String,
    message: String,
}

fn output_error(code: &str, message: impl Into<String>) -> OutputActionError {
    OutputActionError {
        code: code.to_owned(),
        message: message.into(),
    }
}

fn validate_output_file(raw: &str) -> Result<PathBuf, OutputActionError> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err(output_error("OUTPUT_PATH_INVALID", "Đường dẫn output đang trống."));
    }

    let path = PathBuf::from(raw);
    if !path.is_absolute() {
        return Err(output_error(
            "OUTPUT_PATH_INVALID",
            "Output phải là native path tuyệt đối.",
        ));
    }
    if !path.is_file() {
        return Err(output_error(
            "OUTPUT_FILE_MISSING",
            format!("Không tìm thấy file output: {}", path.display()),
        ));
    }

    std::fs::canonicalize(&path).map_err(|error| {
        output_error(
            "OUTPUT_PATH_INVALID",
            format!("Không chuẩn hóa được output {}: {error}", path.display()),
        )
    })
}

#[cfg(windows)]
fn wide(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn open_with_default_app(path: &Path) -> Result<(), OutputActionError> {
    let operation = wide(OsStr::new("open"));
    let file = wide(path.as_os_str());

    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1,
        )
    };

    if result <= 32 {
        return Err(output_error(
            "OUTPUT_OPEN_FAILED",
            format!("Windows không mở được file output (ShellExecuteW={result})."),
        ));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_with_default_app(path: &Path) -> Result<(), OutputActionError> {
    let status = Command::new("open")
        .arg(path)
        .status()
        .map_err(|error| output_error("OUTPUT_OPEN_FAILED", format!("Không chạy được open: {error}")))?;
    if !status.success() {
        return Err(output_error("OUTPUT_OPEN_FAILED", "Không mở được file output."));
    }
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_with_default_app(path: &Path) -> Result<(), OutputActionError> {
    let status = Command::new("xdg-open")
        .arg(path)
        .status()
        .map_err(|error| output_error("OUTPUT_OPEN_FAILED", format!("Không chạy được xdg-open: {error}")))?;
    if !status.success() {
        return Err(output_error("OUTPUT_OPEN_FAILED", "Không mở được file output."));
    }
    Ok(())
}

#[cfg(windows)]
fn reveal_in_folder(path: &Path) -> Result<(), OutputActionError> {
    let status = Command::new("explorer.exe")
        .arg("/select,")
        .arg(path)
        .status()
        .map_err(|error| {
            output_error(
                "OUTPUT_REVEAL_FAILED",
                format!("Không khởi động được Windows Explorer: {error}"),
            )
        })?;

    if !status.success() {
        return Err(output_error(
            "OUTPUT_REVEAL_FAILED",
            "Windows Explorer không thể hiển thị file output.",
        ));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn reveal_in_folder(path: &Path) -> Result<(), OutputActionError> {
    let status = Command::new("open")
        .arg("-R")
        .arg(path)
        .status()
        .map_err(|error| output_error("OUTPUT_REVEAL_FAILED", format!("Không chạy được open -R: {error}")))?;
    if !status.success() {
        return Err(output_error("OUTPUT_REVEAL_FAILED", "Không hiển thị được file output."));
    }
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn reveal_in_folder(path: &Path) -> Result<(), OutputActionError> {
    let parent = path.parent().ok_or_else(|| {
        output_error("OUTPUT_REVEAL_FAILED", "Không xác định được thư mục chứa output.")
    })?;
    let status = Command::new("xdg-open")
        .arg(parent)
        .status()
        .map_err(|error| output_error("OUTPUT_REVEAL_FAILED", format!("Không chạy được xdg-open: {error}")))?;
    if !status.success() {
        return Err(output_error("OUTPUT_REVEAL_FAILED", "Không mở được thư mục output."));
    }
    Ok(())
}

#[tauri::command]
pub async fn open_render_output(path: String) -> Result<OutputActionResult, OutputActionError> {
    let path = validate_output_file(&path)?;
    open_with_default_app(&path)?;
    Ok(OutputActionResult {
        status: "OPENED".to_owned(),
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub async fn reveal_render_output(path: String) -> Result<OutputActionResult, OutputActionError> {
    let path = validate_output_file(&path)?;
    reveal_in_folder(&path)?;
    Ok(OutputActionResult {
        status: "REVEALED".to_owned(),
        path: path.to_string_lossy().into_owned(),
    })
}

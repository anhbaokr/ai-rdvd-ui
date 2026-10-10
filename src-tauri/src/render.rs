use serde::Serialize;
use std::{path::{Path, PathBuf}, process::Command};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderEnvironmentResult {
    pub status: String,
    pub ready: bool,
    pub ffmpeg_path: Option<String>,
    pub ffmpeg_version: Option<String>,
    pub message: String,
    pub diagnostics: Vec<String>,
}

fn command_version(path: &Path) -> Result<String, String> {
    let output = Command::new(path)
        .arg("-version")
        .output()
        .map_err(|error| format!("Không chạy được FFmpeg {}: {error}", path.display()))?;

    if !output.status.success() {
        return Err(format!(
            "FFmpeg {} trả mã lỗi {:?}.",
            path.display(),
            output.status.code()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let first_line = stdout.lines().next().unwrap_or_default().trim();
    if first_line.is_empty() {
        return Err(format!("FFmpeg {} không trả thông tin phiên bản.", path.display()));
    }
    Ok(first_line.to_owned())
}

fn candidate_paths(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("runtime").join("ffmpeg").join("ffmpeg.exe"));
        candidates.push(resource_dir.join("ffmpeg").join("ffmpeg.exe"));
    }

    if let Ok(local_data_dir) = app.path().app_local_data_dir() {
        candidates.push(local_data_dir.join("render-runtime").join("ffmpeg.exe"));
        candidates.push(local_data_dir.join("ffmpeg").join("ffmpeg.exe"));
    }

    candidates.push(crate::project_root().join("runtime").join("ffmpeg").join("ffmpeg.exe"));
    candidates
}

fn append_render_log(app: &AppHandle, lines: Vec<String>) {
    let _ = crate::append_log_lines(app, &lines);
}

#[tauri::command]
pub fn check_render_environment(app: AppHandle) -> RenderEnvironmentResult {
    let mut diagnostics = Vec::new();

    for path in candidate_paths(&app) {
        diagnostics.push(format!("FFmpeg candidate: {} (file={})", path.display(), path.is_file()));
        if !path.is_file() {
            continue;
        }

        match command_version(&path) {
            Ok(version) => {
                diagnostics.push(format!("FFmpeg version: {version}"));
                let result = RenderEnvironmentResult {
                    status: "READY".to_owned(),
                    ready: true,
                    ffmpeg_path: Some(path.to_string_lossy().into_owned()),
                    ffmpeg_version: Some(version.clone()),
                    message: "Môi trường render đã sẵn sàng.".to_owned(),
                    diagnostics,
                };
                append_render_log(
                    &app,
                    vec![
                        "RENDER CHECK — READY".to_owned(),
                        format!("FFmpeg: {}", result.ffmpeg_path.as_deref().unwrap_or("unknown")),
                        format!("Version: {version}"),
                    ],
                );
                return result;
            }
            Err(error) => diagnostics.push(error),
        }
    }

    diagnostics.push("Fallback: kiểm tra lệnh ffmpeg từ PATH hệ thống.".to_owned());
    match command_version(Path::new("ffmpeg")) {
        Ok(version) => {
            let result = RenderEnvironmentResult {
                status: "READY".to_owned(),
                ready: true,
                ffmpeg_path: Some("ffmpeg".to_owned()),
                ffmpeg_version: Some(version.clone()),
                message: "Môi trường render đã sẵn sàng qua FFmpeg trong PATH hệ thống.".to_owned(),
                diagnostics,
            };
            append_render_log(
                &app,
                vec![
                    "RENDER CHECK — READY".to_owned(),
                    "FFmpeg: PATH".to_owned(),
                    format!("Version: {version}"),
                ],
            );
            result
        }
        Err(error) => {
            diagnostics.push(error);
            let result = RenderEnvironmentResult {
                status: "NOT_READY".to_owned(),
                ready: false,
                ffmpeg_path: None,
                ffmpeg_version: None,
                message: "Chưa tìm thấy FFmpeg dùng được cho render. Hãy đặt ffmpeg.exe tại runtime/ffmpeg/ hoặc cài FFmpeg vào PATH khi phát triển.".to_owned(),
                diagnostics,
            };
            append_render_log(
                &app,
                vec![
                    "RENDER CHECK — NOT READY".to_owned(),
                    result.message.clone(),
                ],
            );
            result
        }
    }
}

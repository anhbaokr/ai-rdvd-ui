use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    env,
    fs,
    io::Write,
    path::PathBuf,
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};

const DEFAULT_RUNTIME_MANIFEST_URL: &str =
    "https://github.com/anhbaokr/ai-rdvd-ui/releases/latest/download/runtime-manifest.json";
const MAX_MANIFEST_BYTES: u64 = 2 * 1024 * 1024;
const MAX_RUNTIME_ARTIFACT_BYTES: u64 = 8 * 1024 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeModuleState {
    id: String,
    display_name: String,
    status: String,
    existing_ready: bool,
    auto_provision_supported: bool,
    preferred_install_root: String,
    resolved_paths: Vec<String>,
    version: Option<String>,
    message: String,
    diagnostics: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeManagerState {
    schema_version: u32,
    policy: String,
    auto_provision_enabled: bool,
    modules: Vec<RuntimeModuleState>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeManifest {
    schema_version: u32,
    modules: Vec<RuntimeManifestModule>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeManifestModule {
    id: String,
    version: String,
    url: String,
    sha256: String,
    #[serde(default)]
    size_bytes: Option<u64>,
    #[serde(default = "default_artifact_type")]
    artifact_type: String,
}

fn default_artifact_type() -> String {
    "file".to_owned()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDownloadProgress {
    module_id: String,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    percent: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProvisionResult {
    module_id: String,
    status: String,
    version: Option<String>,
    installed_path: Option<String>,
    downloaded_bytes: u64,
    sha256: Option<String>,
    message: String,
}

fn runtime_manifest_url() -> String {
    env::var("AI_RDVD_RUNTIME_MANIFEST_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_RUNTIME_MANIFEST_URL.to_owned())
}

fn validate_https_url(value: &str, label: &str) -> Result<Url, String> {
    let parsed = Url::parse(value)
        .map_err(|error| format!("{label} không hợp lệ: {error}"))?;
    if parsed.scheme() != "https" {
        return Err(format!("{label} phải sử dụng HTTPS."));
    }
    if parsed.host_str().is_none() {
        return Err(format!("{label} thiếu hostname."));
    }
    Ok(parsed)
}

fn normalize_sha256(value: &str) -> Result<String, String> {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.len() != 64 || !normalized.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("SHA256 runtime phải có đúng 64 ký tự hex.".to_owned());
    }
    Ok(normalized)
}

fn supported_manifest_id(id: &str) -> bool {
    matches!(id, "ffmpeg" | "ocr" | "translation" | "tts")
}

fn install_destination(app: &AppHandle, module_id: &str) -> Result<PathBuf, String> {
    let local_data = app.path().app_local_data_dir()
        .map_err(|error| format!("Không xác định được AppLocalData: {error}"))?;
    match module_id {
        "ffmpeg" => Ok(local_data.join("render-runtime").join("ffmpeg.exe")),
        _ => Err(format!(
            "R7.3.2 chưa cài trực tiếp module {module_id}; hiện downloader atomic chỉ mở cho FFmpeg."
        )),
    }
}

fn archive_install_root(app: &AppHandle, module_id: &str) -> Result<PathBuf, String> {
    let local_data = app.path().app_local_data_dir()
        .map_err(|error| format!("Không xác định được AppLocalData: {error}"))?;
    match module_id {
        "ocr" => Ok(local_data.join("ocr-runtime")),
        "tts" => Ok(local_data.join("tts-runtime")),
        "translation" => Ok(local_data.join("translation-runtime")),
        _ => Err(format!("Module {module_id} không dùng runtime ZIP.")),
    }
}

fn expected_artifact_type(module_id: &str) -> &'static str {
    match module_id {
        "ffmpeg" => "file",
        "ocr" | "tts" | "translation" => "zip",
        _ => "unsupported",
    }
}

fn remove_owned_runtime_path(path: &PathBuf) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Không kiểm tra được runtime path {}: {error}", path.display()))?;
    if metadata.file_type().is_dir() {
        fs::remove_dir_all(path)
            .map_err(|error| format!("Không xóa được runtime directory {}: {error}", path.display()))
    } else {
        fs::remove_file(path)
            .map_err(|error| format!("Không xóa được runtime file {}: {error}", path.display()))
    }
}

fn archive_layout_ready(root: &PathBuf, module_id: &str) -> bool {
    match module_id {
        "ocr" => {
            root.join("python").join("python.exe").is_file()
                && root.join("backend").join("subtitle_ocr").join("worker.py").is_file()
        }
        "tts" => root.join("python").join("python.exe").is_file(),
        "translation" => {
            root.join("python").join("python.exe").is_file()
                && root.join("assets").is_dir()
        }
        _ => false,
    }
}

#[cfg(windows)]
fn safe_extract_runtime_zip(archive: &PathBuf, destination: &PathBuf) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    fs::create_dir_all(destination)
        .map_err(|error| format!("Không tạo được staging runtime {}: {error}", destination.display()))?;

    let script = r#"
$ErrorActionPreference = 'Stop'
$archive = [IO.Path]::GetFullPath($env:AI_RDVD_RUNTIME_ARCHIVE)
$dest = [IO.Path]::GetFullPath($env:AI_RDVD_RUNTIME_STAGING)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$prefix = $dest.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
  foreach ($entry in $zip.Entries) {
    $name = $entry.FullName.Replace('/', [IO.Path]::DirectorySeparatorChar)
    if ([IO.Path]::IsPathRooted($name)) { throw "Rooted ZIP entry is not allowed: $($entry.FullName)" }
    $target = [IO.Path]::GetFullPath((Join-Path $dest $name))
    if (($target -ne $dest) -and (-not $target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase))) {
      throw "ZIP entry escapes staging directory: $($entry.FullName)"
    }
  }
}
finally {
  $zip.Dispose()
}
Expand-Archive -LiteralPath $archive -DestinationPath $dest -Force
"#;

    let output = Command::new("powershell.exe")
        .creation_flags(0x0800_0000)
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-Command")
        .arg(script)
        .env("AI_RDVD_RUNTIME_ARCHIVE", archive)
        .env("AI_RDVD_RUNTIME_STAGING", destination)
        .output()
        .map_err(|error| format!("Không chạy được bộ giải nén runtime an toàn: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "Giải nén runtime ZIP thất bại. stderr: {} stdout: {}",
            String::from_utf8_lossy(&output.stderr).trim(),
            String::from_utf8_lossy(&output.stdout).trim(),
        ));
    }
    Ok(())
}

#[cfg(not(windows))]
fn safe_extract_runtime_zip(_archive: &PathBuf, _destination: &PathBuf) -> Result<(), String> {
    Err("Runtime ZIP auto-provision hiện chỉ hỗ trợ Windows.".to_owned())
}

async fn download_verified_artifact(
    app: &AppHandle,
    module: &RuntimeManifestModule,
) -> Result<(PathBuf, u64, String), String> {
    let expected_sha = normalize_sha256(&module.sha256)?;
    let artifact_url = validate_https_url(&module.url, &format!("URL module {}", module.id))?;
    let expected_size = module.size_bytes;
    let local_data = app.path().app_local_data_dir()
        .map_err(|error| format!("Không xác định được AppLocalData: {error}"))?;
    let downloads = local_data.join("runtime-downloads");
    fs::create_dir_all(&downloads)
        .map_err(|error| format!("Không tạo được runtime-downloads: {error}"))?;

    let extension = if module.artifact_type.eq_ignore_ascii_case("zip") { "zip" } else { "part" };
    let temp = downloads.join(format!(".{}.download-{}.{}", module.id, timestamp_millis(), extension));

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(30 * 60))
        .build()
        .map_err(|error| format!("Không khởi tạo được HTTP client tải runtime: {error}"))?;

    let mut response = client
        .get(artifact_url)
        .header(reqwest::header::USER_AGENT, "AI-RDvD-Runtime-Manager/0.1.5")
        .send()
        .await
        .map_err(|error| format!("Không tải được module {}: {error}", module.id))?;

    if !response.status().is_success() {
        return Err(format!("Module {} trả HTTP {}.", module.id, response.status().as_u16()));
    }

    let response_length = response.content_length();
    if response_length.is_some_and(|size| size > MAX_RUNTIME_ARTIFACT_BYTES) {
        return Err(format!("Module {} vượt giới hạn runtime artifact.", module.id));
    }
    if let (Some(expected), Some(actual)) = (expected_size, response_length) {
        if expected != actual {
            return Err(format!(
                "Kích thước module {} không khớp manifest: expected={} actual={}.",
                module.id, expected, actual
            ));
        }
    }

    let mut file = fs::File::create(&temp)
        .map_err(|error| format!("Không tạo được file tải tạm {}: {error}", temp.display()))?;
    let mut hasher = Sha256::new();
    let mut downloaded = 0u64;
    let mut last_emitted = 0u64;

    let result: Result<(u64, String), String> = async {
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("Đọc dữ liệu tải module {} thất bại: {error}", module.id))?
        {
            downloaded = downloaded
                .checked_add(chunk.len() as u64)
                .ok_or_else(|| "Kích thước tải runtime bị overflow.".to_owned())?;
            if downloaded > MAX_RUNTIME_ARTIFACT_BYTES {
                return Err(format!("Module {} vượt giới hạn runtime artifact.", module.id));
            }
            file.write_all(&chunk)
                .map_err(|error| format!("Ghi file runtime tạm thất bại: {error}"))?;
            hasher.update(&chunk);

            if downloaded.saturating_sub(last_emitted) >= 1024 * 1024 {
                let total = expected_size.or(response_length);
                let percent = total
                    .filter(|total| *total > 0)
                    .map(|total| (downloaded as f64 / total as f64 * 100.0).min(99.0));
                let _ = app.emit(
                    "runtime-download-progress",
                    RuntimeDownloadProgress {
                        module_id: module.id.clone(),
                        downloaded_bytes: downloaded,
                        total_bytes: total,
                        percent,
                    },
                );
                last_emitted = downloaded;
            }
        }

        file.flush()
            .map_err(|error| format!("Flush file runtime tạm thất bại: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Sync file runtime tạm thất bại: {error}"))?;

        if let Some(expected) = expected_size {
            if downloaded != expected {
                return Err(format!(
                    "Kích thước module {} sau tải không khớp manifest: expected={} actual={}.",
                    module.id, expected, downloaded
                ));
            }
        }

        let actual_sha = hasher
            .finalize()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();

        if actual_sha != expected_sha {
            return Err(format!(
                "SHA256 module {} không khớp. expected={} actual={}.",
                module.id, expected_sha, actual_sha
            ));
        }

        Ok((downloaded, actual_sha))
    }
    .await;

    drop(file);

    match result {
        Ok((bytes, sha)) => Ok((temp, bytes, sha)),
        Err(error) => {
            let _ = fs::remove_file(&temp);
            Err(error)
        }
    }
}

fn activate_file_module(
    app: &AppHandle,
    module: &RuntimeManifestModule,
    downloaded: &PathBuf,
) -> Result<Option<String>, String> {
    let destination = install_destination(app, &module.id)?;
    let parent = destination.parent()
        .ok_or_else(|| format!("Không xác định được thư mục cài cho {}.", module.id))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Không tạo được thư mục runtime {}: {error}", parent.display()))?;
    let previous = parent.join("ffmpeg.exe.previous");

    if previous.exists() {
        remove_owned_runtime_path(&previous)?;
    }

    let had_previous = destination.exists();
    if had_previous {
        fs::rename(&destination, &previous)
            .map_err(|error| format!("Không backup runtime cũ {}: {error}", destination.display()))?;
    }

    if let Err(error) = fs::rename(downloaded, &destination) {
        if had_previous && previous.exists() {
            let _ = fs::rename(&previous, &destination);
        }
        return Err(format!("Không finalize runtime {}: {error}", destination.display()));
    }

    let (ready_after, resolved_after) = current_module_ready(app, &module.id)?;
    if !ready_after {
        let _ = remove_owned_runtime_path(&destination);
        if had_previous && previous.exists() {
            let _ = fs::rename(&previous, &destination);
        }
        return Err(format!("Module {} chưa READY sau khi cài; đã rollback.", module.id));
    }

    if previous.exists() {
        let _ = remove_owned_runtime_path(&previous);
    }

    Ok(resolved_after.or_else(|| Some(destination.to_string_lossy().into_owned())))
}

fn activate_archive_module(
    app: &AppHandle,
    module: &RuntimeManifestModule,
    downloaded: &PathBuf,
) -> Result<Option<String>, String> {
    let final_root = archive_install_root(app, &module.id)?;
    let local_data = app.path().app_local_data_dir()
        .map_err(|error| format!("Không xác định được AppLocalData: {error}"))?;
    let staging = local_data.join(format!(".{}.install-{}", module.id, timestamp_millis()));
    let previous = local_data.join(format!(".{}.previous", module.id));

    let _ = remove_owned_runtime_path(&staging);
    if let Err(error) = safe_extract_runtime_zip(downloaded, &staging) {
        let _ = remove_owned_runtime_path(&staging);
        return Err(error);
    }

    if !archive_layout_ready(&staging, &module.id) {
        let _ = remove_owned_runtime_path(&staging);
        return Err(format!("Runtime ZIP {} không đúng layout bắt buộc.", module.id));
    }

    if previous.exists() {
        remove_owned_runtime_path(&previous)?;
    }

    let had_previous = final_root.exists();
    if had_previous {
        fs::rename(&final_root, &previous)
            .map_err(|error| format!("Không backup runtime cũ {}: {error}", final_root.display()))?;
    }

    if let Err(error) = fs::rename(&staging, &final_root) {
        if had_previous && previous.exists() {
            let _ = fs::rename(&previous, &final_root);
        }
        let _ = remove_owned_runtime_path(&staging);
        return Err(format!("Không activate runtime {}: {error}", module.id));
    }

    let (ready_after, resolved_after) = current_module_ready(app, &module.id)?;
    if !ready_after {
        let _ = remove_owned_runtime_path(&final_root);
        if had_previous && previous.exists() {
            let _ = fs::rename(&previous, &final_root);
        }
        return Err(format!("Module {} chưa READY sau khi cài; đã rollback.", module.id));
    }

    if previous.exists() {
        let _ = remove_owned_runtime_path(&previous);
    }

    Ok(resolved_after.or_else(|| Some(final_root.to_string_lossy().into_owned())))
}

async fn fetch_runtime_manifest_internal() -> Result<RuntimeManifest, String> {
    let manifest_url = runtime_manifest_url();
    let url = validate_https_url(&manifest_url, "Runtime manifest URL")?;
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("Không khởi tạo được HTTP client cho runtime manifest: {error}"))?;

    let response = client
        .get(url)
        .header(reqwest::header::USER_AGENT, "AI-RDvD-Runtime-Manager/0.1.5")
        .send()
        .await
        .map_err(|error| format!("Không tải được runtime manifest: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Runtime manifest trả HTTP {}.",
            response.status().as_u16()
        ));
    }

    if response.content_length().is_some_and(|size| size > MAX_MANIFEST_BYTES) {
        return Err("Runtime manifest vượt giới hạn 2 MiB.".to_owned());
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Không đọc được runtime manifest: {error}"))?;
    if bytes.len() as u64 > MAX_MANIFEST_BYTES {
        return Err("Runtime manifest vượt giới hạn 2 MiB.".to_owned());
    }

    let manifest: RuntimeManifest = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Runtime manifest JSON không hợp lệ: {error}"))?;
    if manifest.schema_version != 1 {
        return Err(format!(
            "Runtime manifest schemaVersion={} chưa được hỗ trợ.",
            manifest.schema_version
        ));
    }

    let mut seen = std::collections::HashSet::new();
    for module in &manifest.modules {
        if !supported_manifest_id(&module.id) {
            return Err(format!("Runtime manifest có module id không được phép: {}.", module.id));
        }
        if !seen.insert(module.id.as_str()) {
            return Err(format!("Runtime manifest bị trùng module id: {}.", module.id));
        }
        if module.version.trim().is_empty() {
            return Err(format!("Runtime manifest module {} thiếu version.", module.id));
        }
        validate_https_url(&module.url, &format!("URL module {}", module.id))?;
        normalize_sha256(&module.sha256)?;
        let artifact_type = module.artifact_type.trim().to_ascii_lowercase();
        if artifact_type != expected_artifact_type(&module.id) {
            return Err(format!(
                "Runtime manifest module {} phải có artifactType={}.",
                module.id,
                expected_artifact_type(&module.id),
            ));
        }
        if module.size_bytes.is_some_and(|size| size == 0 || size > MAX_RUNTIME_ARTIFACT_BYTES) {
            return Err(format!(
                "Runtime manifest module {} có sizeBytes không hợp lệ.",
                module.id
            ));
        }
    }

    Ok(manifest)
}

fn current_module_ready(app: &AppHandle, module_id: &str) -> Result<(bool, Option<String>), String> {
    match module_id {
        "ffmpeg" => {
            let state = crate::render::check_render_environment(app.clone());
            Ok((state.ready, state.ffmpeg_path))
        }
        "ocr" => {
            match crate::recognition::check_ocr_environment(app) {
                Ok(state) => Ok((
                    true,
                    Some(state.python_path.to_string_lossy().into_owned()),
                )),
                Err(_) => Ok((false, None)),
            }
        }
        "translation" => {
            let state = crate::check_translation_environment_blocking(app.clone());
            Ok((state.ready, state.python_path))
        }
        "tts" => {
            let state = crate::check_tts_environment_blocking(app.clone());
            Ok((state.ready, state.python_path))
        }
        _ => Err(format!("Module runtime không được hỗ trợ: {module_id}")),
    }
}

fn timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[tauri::command]
pub async fn get_runtime_manifest() -> Result<RuntimeManifest, String> {
    fetch_runtime_manifest_internal().await
}

#[tauri::command]
pub async fn provision_runtime_module(
    app: AppHandle,
    module_id: String,
) -> Result<RuntimeProvisionResult, String> {
    let module_id = module_id.trim().to_ascii_lowercase();
    if !supported_manifest_id(&module_id) {
        return Err(format!("Module runtime không được hỗ trợ: {module_id}"));
    }

    let (already_ready, current_path) = current_module_ready(&app, &module_id)?;
    if already_ready {
        return Ok(RuntimeProvisionResult {
            module_id,
            status: "SKIPPED_EXISTING".to_owned(),
            version: None,
            installed_path: current_path,
            downloaded_bytes: 0,
            sha256: None,
            message: "Module hiện có đang hoạt động; giữ nguyên, không tải lại.".to_owned(),
        });
    }

    let manifest = fetch_runtime_manifest_internal().await?;
    let module = manifest
        .modules
        .into_iter()
        .find(|item| item.id == module_id)
        .ok_or_else(|| format!("Runtime manifest không có module {module_id}."))?;

    let expected_type = expected_artifact_type(&module.id);
    if module.artifact_type.trim().to_ascii_lowercase() != expected_type {
        return Err(format!(
            "Module {} cần artifactType={} nhưng manifest không khớp.",
            module.id, expected_type
        ));
    }

    let (downloaded_path, downloaded_bytes, actual_sha) =
        download_verified_artifact(&app, &module).await?;

    let install_result = if expected_type == "zip" {
        activate_archive_module(&app, &module, &downloaded_path)
    } else {
        activate_file_module(&app, &module, &downloaded_path)
    };

    let installed_path = match install_result {
        Ok(path) => path,
        Err(error) => {
            let _ = remove_owned_runtime_path(&downloaded_path);
            return Err(error);
        }
    };

    let _ = remove_owned_runtime_path(&downloaded_path);
    let _ = app.emit(
        "runtime-download-progress",
        RuntimeDownloadProgress {
            module_id: module.id.clone(),
            downloaded_bytes,
            total_bytes: module.size_bytes,
            percent: Some(100.0),
        },
    );

    Ok(RuntimeProvisionResult {
        module_id: module.id,
        status: "INSTALLED".to_owned(),
        version: Some(module.version),
        installed_path,
        downloaded_bytes,
        sha256: Some(actual_sha),
        message: "Runtime đã tải, xác minh SHA256, activate atomic và health check PASS.".to_owned(),
    })
}

fn preferred_root(app: &AppHandle, name: &str) -> String {
    app.path()
        .app_local_data_dir()
        .map(|root| root.join(name).to_string_lossy().into_owned())
        .unwrap_or_else(|_| crate::project_root().join("app-data").join(name).to_string_lossy().into_owned())
}

fn clean_paths(values: impl IntoIterator<Item = Option<String>>) -> Vec<String> {
    values.into_iter().flatten().filter(|value| !value.trim().is_empty()).collect()
}

fn ffmpeg_state(app: &AppHandle) -> RuntimeModuleState {
    let current = crate::render::check_render_environment(app.clone());
    RuntimeModuleState {
        id: "ffmpeg".to_owned(),
        display_name: "FFmpeg Render Runtime".to_owned(),
        status: if current.ready { "READY" } else { "MISSING" }.to_owned(),
        existing_ready: current.ready,
        auto_provision_supported: true,
        preferred_install_root: preferred_root(app, "render-runtime"),
        resolved_paths: clean_paths([current.ffmpeg_path.clone()]),
        version: current.ffmpeg_version.clone(),
        message: current.message,
        diagnostics: current.diagnostics,
    }
}

fn ocr_state(app: &AppHandle) -> RuntimeModuleState {
    match crate::recognition::check_ocr_environment(app) {
        Ok(current) => RuntimeModuleState {
            id: "ocr".to_owned(),
            display_name: "Subtitle OCR Runtime".to_owned(),
            status: "READY".to_owned(),
            existing_ready: true,
            auto_provision_supported: true,
            preferred_install_root: preferred_root(app, "ocr-runtime"),
            resolved_paths: vec![
                current.python_path.to_string_lossy().into_owned(),
                current.worker_path.to_string_lossy().into_owned(),
            ],
            version: Some(current.version),
            message: "OCR hiện có đã READY; giữ nguyên và tiếp tục sử dụng.".to_owned(),
            diagnostics: current.diagnostics,
        },
        Err(error) => RuntimeModuleState {
            id: "ocr".to_owned(),
            display_name: "Subtitle OCR Runtime".to_owned(),
            status: "MISSING".to_owned(),
            existing_ready: false,
            auto_provision_supported: true,
            preferred_install_root: preferred_root(app, "ocr-runtime"),
            resolved_paths: Vec::new(),
            version: Some("PaddleOCR 2.9.1 / PaddlePaddle 3.0.0 / PP-OCRv4".to_owned()),
            message: error.clone(),
            diagnostics: vec![error],
        },
    }
}

fn tts_state(app: &AppHandle) -> RuntimeModuleState {
    let current = crate::check_tts_environment_blocking(app.clone());
    let ready = current.ready;
    let diagnostics = current.diagnostics;

    RuntimeModuleState {
        id: "tts".to_owned(),
        display_name: "VieNeu TTS Runtime".to_owned(),
        status: if ready { "READY" } else { "MISSING" }.to_owned(),
        existing_ready: ready,
        auto_provision_supported: true,
        preferred_install_root: preferred_root(app, "tts-runtime"),
        resolved_paths: clean_paths([
            current.python_path,
            current.worker_path,
            Some(current.audio_directory),
        ]),
        version: Some("VieNeu v3 Turbo".to_owned()),
        message: current.message,
        diagnostics,
    }
}

fn translation_state(app: &AppHandle) -> RuntimeModuleState {
    let current = crate::check_translation_environment_blocking(app.clone());
    let ready = current.ready;
    let diagnostics = current.diagnostics;

    RuntimeModuleState {
        id: "translation".to_owned(),
        display_name: "Translation Runtime".to_owned(),
        status: if ready { "READY" } else { "MISSING" }.to_owned(),
        existing_ready: ready,
        auto_provision_supported: true,
        preferred_install_root: preferred_root(app, "translation-runtime"),
        resolved_paths: clean_paths([
            current.python_path,
            current.worker_path,
            Some(current.assets_root),
        ]),
        version: None,
        message: current.message,
        diagnostics,
    }
}

#[tauri::command]
pub async fn check_runtime_modules(app: AppHandle) -> Result<RuntimeManagerState, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let modules = vec![
            ffmpeg_state(&app),
            ocr_state(&app),
            translation_state(&app),
            tts_state(&app),
        ];

        Ok(RuntimeManagerState {
            schema_version: 1,
            policy: "preserve-existing-download-missing".to_owned(),
            auto_provision_enabled: true,
            modules,
        })
    })
    .await
    .map_err(|error| format!("Runtime Manager check bị gián đoạn: {error}"))?
}

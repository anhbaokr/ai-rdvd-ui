use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    env,
    fs,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};

const DEFAULT_PROJECT_ROOT: &str = r"E:\ai-rdvd-ui";
const RESULT_PREFIX: &str = "AI_RDVD_RESULT:";
const PROGRESS_PREFIX: &str = "AI_RDVD_PROGRESS:";
const MAX_LOG_FILE_BYTES: u64 = 5 * 1024 * 1024;
static LOG_WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Copy)]
struct VoiceProfile {
    id: &'static str,
    name: &'static str,
    preview_stem: &'static str,
}

const VOICES: &[VoiceProfile] = &[
    VoiceProfile { id: "minh-duc", name: "Minh Đức", preview_stem: "01-Minh-Đức" },
    VoiceProfile { id: "pham-tuyen", name: "Phạm Tuyên", preview_stem: "02-Phạm-Tuyền" },
    VoiceProfile { id: "thai-son", name: "Thái Sơn", preview_stem: "03-Thái-Sơn" },
    VoiceProfile { id: "xuan-vinh", name: "Xuân Vĩnh", preview_stem: "04-Xuân-Vinh" },
    VoiceProfile { id: "thanh-binh", name: "Thanh Bình", preview_stem: "05-Thanh-Bình" },
    VoiceProfile { id: "truc-ly", name: "Trúc Ly", preview_stem: "06-Trúc-Ly" },
    VoiceProfile { id: "ngoc-linh", name: "Ngọc Linh", preview_stem: "07-Ngọc-Linh" },
    VoiceProfile { id: "doan-trang", name: "Đoan Trang", preview_stem: "08-Đoan-Trang" },
    VoiceProfile { id: "mai-anh", name: "Mai Anh", preview_stem: "09-Mai-Anh" },
    VoiceProfile { id: "thuc-doan", name: "Thục Đoan", preview_stem: "10-Thục-Đoan" },
    VoiceProfile { id: "minh-triet", name: "Minh Triết", preview_stem: "11-Minh-Triết" },
    VoiceProfile { id: "thuy-dung", name: "Thùy Dung", preview_stem: "12-Thùy-Dung" },
    VoiceProfile { id: "quang-son", name: "Quang Sơn", preview_stem: "13-Quang-Sơn" },
    VoiceProfile { id: "ngoc-tran", name: "Ngọc Trân", preview_stem: "14-Ngọc-Trân" },
    VoiceProfile { id: "my-duyen", name: "Mỹ Duyên", preview_stem: "15-Mỹ-Duyên" },
    VoiceProfile { id: "quynh-anh", name: "Quỳnh Anh", preview_stem: "16-Quỳnh-Anh" },
    VoiceProfile { id: "duc-tri", name: "Đức Trí", preview_stem: "17-Đức-Trí" },
    VoiceProfile { id: "kim-thanh", name: "Kim Thanh", preview_stem: "18-Kim-Thanh" },
    VoiceProfile { id: "ngoc-huyen", name: "Ngọc Huyền", preview_stem: "19-Ngọc-Huyền" },
    VoiceProfile { id: "adam", name: "Adam", preview_stem: "20-Adam" },
    VoiceProfile { id: "manh-dung", name: "Mạnh Dũng", preview_stem: "21-Mạnh-Dũng" },
    VoiceProfile { id: "minh-quan", name: "Minh Quân", preview_stem: "22-Minh-Quân" },
    VoiceProfile { id: "anh-khoi", name: "Anh Khôi", preview_stem: "23-Anh-Khôi" },
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VoicePreviewResult {
    data_url: String,
    file_path: String,
    voice_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TtsEnvironmentResult {
    ready: bool,
    python_path: Option<String>,
    worker_path: Option<String>,
    audio_directory: String,
    output_directory: String,
    log_file_path: String,
    message: String,
    diagnostics: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TtsCueRequest {
    segment_id: String,
    start_ms: i64,
    end_ms: i64,
    text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateTtsRequest {
    text: String,
    voice_id: String,
    speed: f32,
    pitch: f32,
    #[serde(default)]
    cues: Option<Vec<TtsCueRequest>>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TtsCueResult {
    segment_id: String,
    start_ms: i64,
    end_ms: i64,
    text: String,
    actual_start_ms: i64,
    actual_end_ms: i64,
    duration_seconds: f64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TtsGenerationResult {
    output_path: String,
    voice_name: String,
    duration_seconds: f64,
    sample_rate: u32,
    #[serde(default)]
    diagnostics: Vec<String>,
    #[serde(default)]
    aligned: bool,
    #[serde(default)]
    cues: Vec<TtsCueResult>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TranslationEnvironmentResult {
    ready: bool,
    python_path: Option<String>,
    worker_path: Option<String>,
    assets_root: String,
    output_directory: String,
    log_file_path: String,
    message: String,
    diagnostics: Vec<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TranslationSegmentRequest {
    segment_id: String,
    start_ms: u64,
    end_ms: u64,
    source_text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TranslationRequest {
    job_id: String,
    segments: Vec<TranslationSegmentRequest>,
    #[serde(default = "default_true")]
    resume: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveTranslationFileRequest {
    file_name: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedTranslationFile {
    file_name: String,
    output_path: String,
    output_directory: String,
}

fn default_true() -> bool {
    true
}

fn voice_profile(id: &str) -> Result<VoiceProfile, String> {
    VOICES.iter().copied().find(|voice| voice.id == id)
        .ok_or_else(|| format!("Mã giọng đọc không hợp lệ: {id}"))
}

fn project_root() -> PathBuf {
    if let Some(value) = env::var_os("AI_RDVD_HOME") {
        return PathBuf::from(value);
    }
    let preferred = PathBuf::from(DEFAULT_PROJECT_ROOT);
    if preferred.exists() {
        return preferred;
    }
    env::current_dir().unwrap_or(preferred)
}

fn audio_directory() -> PathBuf {
    env::var_os("AI_RDVD_AUDIO_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| project_root().join("audio"))
}

fn output_directory(app: &tauri::AppHandle) -> PathBuf {
    if let Some(value) = env::var_os("AI_RDVD_OUTPUT_DIR") {
        return PathBuf::from(value);
    }
    let preferred = PathBuf::from(DEFAULT_PROJECT_ROOT);
    if preferred.exists() {
        return preferred.join("output").join("tts");
    }
    app.path().app_local_data_dir()
        .unwrap_or_else(|_| project_root())
        .join("output")
        .join("tts")
}

fn log_directory(app: &tauri::AppHandle) -> PathBuf {
    if let Ok(directory) = app.path().app_local_data_dir() {
        return directory.join("logs");
    }
    if let Some(local_data) = env::var_os("LOCALAPPDATA") {
        return PathBuf::from(local_data).join("com.airdvd.app").join("logs");
    }
    project_root().join("app-data").join("logs")
}

fn log_file(app: &tauri::AppHandle) -> PathBuf {
    log_directory(app).join("ai-rdvd-technical.log")
}

fn append_log_lines(app: &tauri::AppHandle, lines: &[String]) -> Result<(), String> {
    if lines.is_empty() {
        return Ok(());
    }
    let _guard = LOG_WRITE_LOCK.lock()
        .map_err(|_| "Khóa ghi log đã bị lỗi.".to_owned())?;
    let directory = log_directory(app);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Không tạo được thư mục log {}: {error}", directory.display()))?;
    let path = log_file(app);
    if path.metadata().is_ok_and(|metadata| metadata.len() >= MAX_LOG_FILE_BYTES) {
        let rotated = directory.join("ai-rdvd-technical.log.1");
        if rotated.exists() {
            fs::remove_file(&rotated)
                .map_err(|error| format!("Không xóa được log dự phòng {}: {error}", rotated.display()))?;
        }
        fs::rename(&path, &rotated)
            .map_err(|error| format!("Không luân phiên được file log {}: {error}", path.display()))?;
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| format!("Không ghi được file log {}: {error}", path.display()))?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    for line in lines {
        writeln!(file, "[{timestamp}] {line}")
            .map_err(|error| format!("Không ghi được file log {}: {error}", path.display()))?;
    }
    Ok(())
}

fn decode_process_output(bytes: &[u8]) -> String {
    let null_count = bytes.iter().filter(|byte| **byte == 0).count();
    let decoded = if bytes.len() >= 4 && null_count * 5 > bytes.len() {
        let first_null = bytes.iter().position(|byte| *byte == 0).unwrap_or(0);
        let split_at = bytes[..first_null].iter().rposition(|byte| *byte == b'\n')
            .map_or(0, |position| position + 1);
        let prefix = String::from_utf8_lossy(&bytes[..split_at]);
        let utf16_bytes = &bytes[split_at..];
        let words = utf16_bytes.chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect::<Vec<_>>();
        format!("{prefix}{}", String::from_utf16_lossy(&words))
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    };
    strip_terminal_controls(&decoded)
}

fn strip_terminal_controls(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut escape = false;
    for character in value.chars() {
        if escape {
            if character.is_ascii_alphabetic() {
                escape = false;
            }
            continue;
        }
        if character == '\u{1b}' {
            escape = true;
        } else if character != '\0' && character != '\r' {
            output.push(character);
        }
    }
    output
}

fn preview_directories(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut directories = vec![audio_directory()];
    if let Ok(resources) = app.path().resource_dir() {
        directories.push(resources.join("audio"));
        directories.push(resources.join("_up_").join("audio"));
    }
    directories
}

fn resolve_preview_file(app: &tauri::AppHandle, profile: VoiceProfile) -> Result<PathBuf, String> {
    let directories = preview_directories(app);
    for directory in &directories {
        let direct = directory.join(format!("{}.mp3", profile.preview_stem));
        if direct.is_file() {
            return Ok(direct);
        }
        let Ok(entries) = fs::read_dir(directory) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let extension_is_mp3 = path.extension()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.eq_ignore_ascii_case("mp3"));
            let stem_matches = path.file_stem()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value == profile.preview_stem);
            if path.is_file() && extension_is_mp3 && stem_matches {
                return Ok(path);
            }
        }
    }
    let searched = directories.iter().map(|path| path.display().to_string()).collect::<Vec<_>>().join(", ");
    Err(format!("Không tìm thấy {}.mp3. Đã kiểm tra: {searched}", profile.preview_stem))
}

fn python_candidates(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    // 1. User override
    if let Some(value) = env::var_os("AI_RDVD_PYTHON") {
        candidates.push(PathBuf::from(value));
    }

    if cfg!(windows) {
        // 2. System Python (preferred)
        candidates.push(PathBuf::from(
            r"C:\Users\1stPK-MU\AppData\Local\Programs\Python\Python312\python.exe"
        ));

        // 3. Python from PATH
        candidates.push(PathBuf::from("python.exe"));
        candidates.push(PathBuf::from("py.exe"));

        // 4. Optional bundled runtime
        let root = project_root();

        candidates.push(
            root.join("runtime")
                .join("python")
                .join("python.exe")
        );

        if let Ok(resources) = app.path().resource_dir() {
            candidates.push(
                resources
                    .join("runtime")
                    .join("python")
                    .join("python.exe")
            );

            candidates.push(
                resources
                    .join("_up_")
                    .join("runtime")
                    .join("python")
                    .join("python.exe")
            );
        }
    } else {
        let root = project_root();

        candidates.push(
            root.join("runtime")
                .join("python")
                .join("bin")
                .join("python3")
        );

        candidates.push(PathBuf::from("python3"));
        candidates.push(PathBuf::from("python"));
    }

    candidates
}

fn configure_command(program: &Path) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command
}

fn resolve_python(app: &tauri::AppHandle) -> Option<PathBuf> {
    python_candidates(app).into_iter().find(|candidate| {
        configure_command(candidate)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|status| status.success())
    })
}

fn resolve_worker(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Some(value) = env::var_os("AI_RDVD_TTS_WORKER") {
        let path = PathBuf::from(value);
        if path.is_file() {
            return Some(path);
        }
    }
    let mut candidates = vec![
        project_root().join("backend").join("tts_worker.py"),
        env::current_dir().ok()?.join("backend").join("tts_worker.py"),
    ];
    if let Ok(resources) = app.path().resource_dir() {
        candidates.push(resources.join("backend").join("tts_worker.py"));
        candidates.push(resources.join("_up_").join("backend").join("tts_worker.py"));
    }
    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn translation_python_candidates(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(value) = env::var_os("AI_RDVD_TRANSLATION_PYTHON") {
        candidates.push(PathBuf::from(value));
    }
    let root = project_root();
    if cfg!(windows) {
        candidates.push(root.join(".translation-venv").join("Scripts").join("python.exe"));
        if let Ok(local_data) = app.path().app_local_data_dir() {
            candidates.push(local_data.join("translation-runtime").join(".venv").join("Scripts").join("python.exe"));
            candidates.push(local_data.join("translation-runtime").join("python").join("python.exe"));
        }
        if let Ok(resources) = app.path().resource_dir() {
            candidates.push(resources.join("translation-runtime").join("python").join("python.exe"));
            candidates.push(resources.join("_up_").join("translation-runtime").join("python").join("python.exe"));
        }
        candidates.push(PathBuf::from("python.exe"));
        candidates.push(PathBuf::from("py.exe"));
    } else {
        candidates.push(root.join(".translation-venv").join("bin").join("python"));
        if let Ok(local_data) = app.path().app_local_data_dir() {
            candidates.push(local_data.join("translation-runtime").join(".venv").join("bin").join("python"));
        }
        candidates.push(PathBuf::from("python3"));
        candidates.push(PathBuf::from("python"));
    }
    candidates
}

fn resolve_translation_python(app: &tauri::AppHandle) -> Option<PathBuf> {
    translation_python_candidates(app).into_iter().find(|candidate| {
        configure_command(candidate)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|status| status.success())
    })
}

fn resolve_translation_worker(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Some(value) = env::var_os("AI_RDVD_TRANSLATION_WORKER") {
        let path = PathBuf::from(value);
        if path.is_file() {
            return Some(path);
        }
    }
    let mut candidates = vec![
        project_root().join("backend").join("translation_worker.py"),
        env::current_dir().ok()?.join("backend").join("translation_worker.py"),
    ];
    if let Ok(resources) = app.path().resource_dir() {
        candidates.push(resources.join("backend").join("translation_worker.py"));
        candidates.push(resources.join("_up_").join("backend").join("translation_worker.py"));
    }
    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn translation_assets_candidates(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(value) = env::var_os("AI_RDVD_TRANSLATION_ASSETS") {
        candidates.push(PathBuf::from(value));
    }
    candidates.push(project_root().join("translation-assets"));
    if let Ok(local_data) = app.path().app_local_data_dir() {
        candidates.push(local_data.join("translation").join("assets"));
    }
    if let Ok(resources) = app.path().resource_dir() {
        candidates.push(resources.join("translation-assets"));
        candidates.push(resources.join("_up_").join("translation-assets"));
    }
    candidates
}

fn translation_assets_root(app: &tauri::AppHandle) -> PathBuf {
    let candidates = translation_assets_candidates(app);
    candidates.iter().find(|path| path.is_dir()).cloned()
        .or_else(|| candidates.into_iter().next())
        .unwrap_or_else(|| project_root().join("translation-assets"))
}

fn resolve_translation_template(app: &tauri::AppHandle) -> Option<PathBuf> {
    let mut candidates = vec![project_root().join("translation-template")];
    if let Ok(resources) = app.path().resource_dir() {
        candidates.push(resources.join("translation-template"));
        candidates.push(resources.join("_up_").join("translation-template"));
    }
    candidates.into_iter().find(|candidate| candidate.is_dir())
}

fn resolve_translation_setup_script(app: &tauri::AppHandle) -> Option<PathBuf> {
    let mut candidates = vec![project_root().join("scripts").join("setup-translation-windows.ps1")];
    if let Ok(resources) = app.path().resource_dir() {
        candidates.push(resources.join("scripts").join("setup-translation-windows.ps1"));
        candidates.push(resources.join("_up_").join("scripts").join("setup-translation-windows.ps1"));
    }
    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn translation_output_directory(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_local_data_dir()
        .unwrap_or_else(|_| project_root().join("app-data"))
        .join("output")
        .join("translation")
}

fn valid_job_id(job_id: &str) -> bool {
    !job_id.is_empty()
        && job_id.len() <= 96
        && job_id.chars().all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '.'))
}

fn safe_translation_file_name(value: &str) -> String {
    let candidate = Path::new(value)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("translated.vi.srt");
    let sanitized = candidate.chars()
        .map(|character| {
            if character.is_control() || matches!(character, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
                '_'
            } else {
                character
            }
        })
        .collect::<String>()
        .trim_matches(|character: char| character == '.' || character.is_whitespace())
        .to_owned();
    let mut result = if sanitized.is_empty() { "translated.vi.srt".to_owned() } else { sanitized };
    if !result.to_ascii_lowercase().ends_with(".srt") {
        result.push_str(".srt");
    }
    result
}

fn run_translation_worker(
    app: &tauri::AppHandle,
    python: &Path,
    worker: &Path,
    assets_root: &Path,
    check_only: bool,
    payload: Option<&Value>,
) -> Result<Value, String> {
    let mut command = configure_command(python);
    command.arg(worker);
    if check_only {
        command.arg("--check");
    }
    command
        .arg("--assets-root")
        .arg(assets_root)
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUNBUFFERED", "1")
        .stdin(if payload.is_some() { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn()
        .map_err(|error| format!("Không khởi động được translation worker: {error}"))?;
    if let (Some(value), Some(mut stdin)) = (payload, child.stdin.take()) {
        let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
        stdin.write_all(&bytes)
            .map_err(|error| format!("Không gửi được dữ liệu dịch: {error}"))?;
    }

    let stdout = child.stdout.take().ok_or_else(|| "Không đọc được stdout của translation worker.".to_owned())?;
    let mut stderr = child.stderr.take().ok_or_else(|| "Không đọc được stderr của translation worker.".to_owned())?;
    let stderr_reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stderr.read_to_end(&mut bytes);
        bytes
    });

    let mut final_result = None;
    let mut captured_output = Vec::new();
    for line in BufReader::new(stdout).lines() {
        let line = line.map_err(|error| format!("Không đọc được output của translation worker: {error}"))?;
        if let Some(value) = line.strip_prefix(PROGRESS_PREFIX) {
            if let Ok(progress) = serde_json::from_str::<Value>(value) {
                let _ = app.emit("translation-progress", progress);
            }
        } else if let Some(value) = line.strip_prefix(RESULT_PREFIX) {
            final_result = Some(
                serde_json::from_str::<Value>(value)
                    .map_err(|error| format!("Không đọc được kết quả dịch: {error}"))?,
            );
        } else if !line.trim().is_empty() {
            captured_output.push(line);
        }
    }

    let status = child.wait().map_err(|error| format!("Translation worker bị gián đoạn: {error}"))?;
    let stderr_bytes = stderr_reader.join().unwrap_or_default();
    let stderr_text = decode_process_output(&stderr_bytes);
    if !status.success() {
        return Err(format!(
            "Translation worker thất bại (exit {}). stderr: {} stdout: {}",
            status.code().map_or_else(|| "unknown".to_owned(), |code| code.to_string()),
            stderr_text.trim(),
            captured_output.join(" | "),
        ).trim().to_owned());
    }
    final_result.ok_or_else(|| format!(
        "Translation worker không trả về kết quả hợp lệ. stderr: {} stdout: {}",
        stderr_text.trim(), captured_output.join(" | "),
    ))
}

fn parse_worker_result<T: for<'de> Deserialize<'de>>(stdout: &[u8]) -> Result<T, String> {
    let output = String::from_utf8_lossy(stdout);
    let payload = output.lines().rev()
        .find_map(|line| line.strip_prefix(RESULT_PREFIX))
        .ok_or_else(|| format!("TTS worker không trả về kết quả hợp lệ. Output: {}", output.trim()))?;
    serde_json::from_str(payload).map_err(|error| format!("Không đọc được kết quả TTS: {error}"))
}

fn run_worker<T: for<'de> Deserialize<'de>>(
    python: &Path,
    worker: &Path,
    arguments: &[&str],
    payload: Option<&Value>,
) -> Result<T, String> {
    let mut child = configure_command(python)
        .arg(worker)
        .args(arguments)
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUNBUFFERED", "1")
        .stdin(if payload.is_some() { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Không khởi động được TTS worker: {error}"))?;

    if let (Some(value), Some(mut stdin)) = (payload, child.stdin.take()) {
        let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
        stdin.write_all(&bytes).map_err(|error| format!("Không gửi được dữ liệu TTS: {error}"))?;
    }

    let output = child.wait_with_output().map_err(|error| format!("TTS worker bị lỗi: {error}"))?;
    if !output.status.success() {
        let stderr = decode_process_output(&output.stderr);
        let stdout = decode_process_output(&output.stdout);
        return Err(format!(
            "TTS worker thất bại (exit {}). stderr: {} stdout: {}",
            output.status.code().map_or_else(|| "unknown".to_owned(), |code| code.to_string()),
            stderr.trim(), stdout.trim(),
        ).trim().to_owned());
    }
    parse_worker_result(&output.stdout)
}

fn run_tts_worker<T: for<'de> Deserialize<'de>>(
    app: &tauri::AppHandle,
    python: &Path,
    worker: &Path,
    payload: &Value,
) -> Result<T, String> {
    let mut child = configure_command(python)
        .arg(worker)
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUNBUFFERED", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Không khởi động được TTS worker: {error}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        let bytes = serde_json::to_vec(payload).map_err(|error| error.to_string())?;
        stdin.write_all(&bytes).map_err(|error| format!("Không gửi được dữ liệu TTS: {error}"))?;
    }

    let stdout = child.stdout.take().ok_or_else(|| "Không đọc được stdout của TTS worker.".to_owned())?;
    let mut stderr = child.stderr.take().ok_or_else(|| "Không đọc được stderr của TTS worker.".to_owned())?;
    let stderr_reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stderr.read_to_end(&mut bytes);
        bytes
    });

    let mut final_result = None;
    let mut captured_output = Vec::new();
    for line in BufReader::new(stdout).lines() {
        let line = line.map_err(|error| format!("Không đọc được output của TTS worker: {error}"))?;
        if let Some(value) = line.strip_prefix(PROGRESS_PREFIX) {
            if let Ok(progress) = serde_json::from_str::<Value>(value) {
                let _ = app.emit("tts-progress", progress);
            }
        } else if let Some(value) = line.strip_prefix(RESULT_PREFIX) {
            final_result = Some(
                serde_json::from_str::<T>(value)
                    .map_err(|error| format!("Không đọc được kết quả TTS: {error}"))?,
            );
        } else if !line.trim().is_empty() {
            captured_output.push(line);
        }
    }

    let status = child.wait().map_err(|error| format!("TTS worker bị gián đoạn: {error}"))?;
    let stderr_bytes = stderr_reader.join().unwrap_or_default();
    let stderr_text = decode_process_output(&stderr_bytes);
    if !status.success() {
        return Err(format!(
            "TTS worker thất bại (exit {}). stderr: {} stdout: {}",
            status.code().map_or_else(|| "unknown".to_owned(), |code| code.to_string()),
            stderr_text.trim(),
            captured_output.join(" | "),
        ).trim().to_owned());
    }
    final_result.ok_or_else(|| format!(
        "TTS worker không trả về kết quả hợp lệ. stderr: {} stdout: {}",
        stderr_text.trim(), captured_output.join(" | "),
    ))
}

#[tauri::command]
fn load_voice_preview(app: tauri::AppHandle, voice_id: String) -> Result<VoicePreviewResult, String> {
    let profile = voice_profile(&voice_id)?;
    let path = resolve_preview_file(&app, profile)?;
    let bytes = fs::read(&path).map_err(|error| format!("Không đọc được {}: {error}", path.display()))?;
    Ok(VoicePreviewResult {
        data_url: format!("data:audio/mpeg;base64,{}", STANDARD.encode(bytes)),
        file_path: path.to_string_lossy().into_owned(),
        voice_name: profile.name.to_owned(),
    })
}

fn check_tts_environment_blocking(app: tauri::AppHandle) -> TtsEnvironmentResult {
    let audio = audio_directory();
    let output = output_directory(&app);
    let log_path = log_file(&app);
    let candidates = python_candidates(&app);
    let python = resolve_python(&app);
    let worker = resolve_worker(&app);
    let mut diagnostics = vec![
        format!("Project root: {}", project_root().display()),
        format!("Audio directory: {} (exists={})", audio.display(), audio.is_dir()),
        format!("Output directory: {}", output.display()),
        format!("Worker: {}", worker.as_ref().map_or_else(|| "not found".to_owned(), |path| path.display().to_string())),
        format!("Python selected: {}", python.as_ref().map_or_else(|| "not found".to_owned(), |path| path.display().to_string())),
    ];
    diagnostics.extend(candidates.iter().map(|path| {
        format!("Python candidate: {} (file={})", path.display(), path.is_file())
    }));
    let (ready, message) = match (&python, &worker) {
        (Some(python_path), Some(worker_path)) => {
            let check: Result<Value, String> = run_worker(python_path, worker_path, &["--check"], None);
            match check {
                Ok(value) => {
                    if let Some(items) = value.get("diagnostics").and_then(Value::as_array) {
                        diagnostics.extend(items.iter().filter_map(Value::as_str).map(str::to_owned));
                    }
                    let is_ready = value.get("ready").and_then(Value::as_bool) == Some(true);
                    let fallback = if is_ready { "VieNeu TTS đã sẵn sàng." } else { "Thiếu module VieNeu TTS." };
                    (is_ready, value.get("message").and_then(Value::as_str).unwrap_or(fallback).to_owned())
                }
                Err(error) => {
                    diagnostics.push(format!("Worker error: {error}"));
                    (false, error)
                }
            }
        }
        (None, _) => (false, "Không tìm thấy Python. Hãy chạy scripts/setup-tts-windows.ps1.".to_owned()),
        (_, None) => (false, "Không tìm thấy backend/tts_worker.py.".to_owned()),
    };

    let mut persisted = vec![format!("TTS CHECK — {}", if ready { "READY" } else { "NOT READY" })];
    persisted.extend(diagnostics.iter().cloned());
    persisted.push(format!("Message: {message}"));
    if let Err(error) = append_log_lines(&app, &persisted) {
        diagnostics.push(format!("Log persistence error: {error}"));
    }

    TtsEnvironmentResult {
        ready,
        python_path: python.map(|path| path.to_string_lossy().into_owned()),
        worker_path: worker.map(|path| path.to_string_lossy().into_owned()),
        audio_directory: audio.to_string_lossy().into_owned(),
        output_directory: output.to_string_lossy().into_owned(),
        log_file_path: log_path.to_string_lossy().into_owned(),
        message,
        diagnostics,
    }
}

#[tauri::command]
async fn check_tts_environment(app: tauri::AppHandle) -> Result<TtsEnvironmentResult, String> {
    tauri::async_runtime::spawn_blocking(move || check_tts_environment_blocking(app))
        .await
        .map_err(|error| format!("Không thể kiểm tra môi trường TTS: {error}"))
}

fn generate_tts_blocking(app: tauri::AppHandle, request: GenerateTtsRequest) -> Result<TtsGenerationResult, String> {
    let text = request.text.trim();
    let cues = request.cues.clone().unwrap_or_default();
    if cues.is_empty() && text.is_empty() {
        return Err("Nội dung tạo giọng đang trống.".to_owned());
    }
    if text.chars().count() > 100_000 {
        return Err("Nội dung TTS vượt quá giới hạn 100.000 ký tự cho một lượt.".to_owned());
    }
    if cues.len() > 2000 {
        return Err("Số lượng cue TTS vượt quá giới hạn 2000 câu cho một lượt.".to_owned());
    }
    for cue in &cues {
        if cue.segment_id.trim().is_empty() || cue.text.trim().is_empty() {
            return Err("Cue TTS có segment_id hoặc text trống.".to_owned());
        }
        if cue.start_ms < 0 || cue.end_ms <= cue.start_ms {
            return Err(format!("Cue TTS không hợp lệ: {}.", cue.segment_id));
        }
        if cue.text.chars().count() > 5000 {
            return Err(format!("Cue TTS {} vượt quá 5000 ký tự.", cue.segment_id));
        }
    }
    if !(0.5..=2.0).contains(&request.speed) || !(-12.0..=12.0).contains(&request.pitch) {
        return Err("Tốc độ hoặc cao độ nằm ngoài giới hạn giao diện.".to_owned());
    }

    let profile = voice_profile(&request.voice_id)?;
    let python = resolve_python(&app).ok_or_else(|| "Không tìm thấy Python/.venv/runtime cho VieNeu TTS.".to_owned())?;
    let worker = resolve_worker(&app).ok_or_else(|| "Không tìm thấy backend/tts_worker.py.".to_owned())?;
    let output_dir = output_directory(&app);
    fs::create_dir_all(&output_dir)
        .map_err(|error| format!("Không tạo được thư mục output {}: {error}", output_dir.display()))?;
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    let output_path = output_dir.join(format!("{}-{timestamp}.wav", profile.id));
    let payload = json!({
        "text": text,
        "voiceName": profile.name,
        "speed": request.speed,
        "pitch": request.pitch,
        "cues": cues,
        "outputPath": output_path.to_string_lossy(),
        "backend": "onnx",
        "device": "cpu",
        "dtype": "fp32"
    });
    let started = SystemTime::now();
    let result: Result<TtsGenerationResult, String> = run_tts_worker(&app, &python, &worker, &payload);
    match result {
        Ok(mut generated) => {
            generated.diagnostics.insert(0, format!("Python: {}", python.display()));
            generated.diagnostics.insert(1, format!("Worker: {}", worker.display()));
            generated.diagnostics.push(format!(
                "Total backend time: {:.2}s",
                started.elapsed().unwrap_or_default().as_secs_f64(),
            ));
            let mut lines = vec![format!("TTS GENERATE — OK — voice={}", generated.voice_name)];
            lines.extend(generated.diagnostics.iter().cloned());
            if let Err(error) = append_log_lines(&app, &lines) {
                generated.diagnostics.push(format!("Log persistence error: {error}"));
            }
            Ok(generated)
        }
        Err(error) => {
            let lines = vec![
                "TTS GENERATE — ERROR".to_owned(),
                format!("Python: {}", python.display()),
                format!("Worker: {}", worker.display()),
                format!("Error: {error}"),
            ];
            match append_log_lines(&app, &lines) {
                Ok(()) => Err(error),
                Err(log_error) => Err(format!("{error} | Không ghi được log: {log_error}")),
            }
        }
    }
}

#[tauri::command]
async fn generate_tts(app: tauri::AppHandle, request: GenerateTtsRequest) -> Result<TtsGenerationResult, String> {
    tauri::async_runtime::spawn_blocking(move || generate_tts_blocking(app, request))
        .await
        .map_err(|error| format!("Tác vụ TTS bị gián đoạn: {error}"))?
}

fn check_translation_environment_blocking(app: tauri::AppHandle) -> TranslationEnvironmentResult {
    let python = resolve_translation_python(&app);
    let worker = resolve_translation_worker(&app);
    let assets_root = translation_assets_root(&app);
    let output = translation_output_directory(&app);
    let log_path = log_file(&app);
    let mut diagnostics = vec![
        format!("Translation assets: {} (exists={})", assets_root.display(), assets_root.is_dir()),
        format!("Translation worker: {}", worker.as_ref().map_or_else(|| "not found".to_owned(), |path| path.display().to_string())),
        format!("Translation Python: {}", python.as_ref().map_or_else(|| "not found".to_owned(), |path| path.display().to_string())),
        format!("Translation output: {}", output.display()),
    ];
    diagnostics.extend(translation_python_candidates(&app).iter().map(|path| {
        format!("Translation Python candidate: {} (file={})", path.display(), path.is_file())
    }));

    let (ready, message) = match (&python, &worker) {
        (Some(python_path), Some(worker_path)) => {
            match run_translation_worker(&app, python_path, worker_path, &assets_root, true, None) {
                Ok(value) => {
                    if let Some(items) = value.get("diagnostics").and_then(Value::as_array) {
                        diagnostics.extend(items.iter().filter_map(Value::as_str).map(str::to_owned));
                    }
                    let is_ready = value.get("ready").and_then(Value::as_bool) == Some(true);
                    let fallback = if is_ready { "Mô-đun dịch đã sẵn sàng." } else { "Mô-đun dịch chưa sẵn sàng." };
                    (is_ready, value.get("message").and_then(Value::as_str).unwrap_or(fallback).to_owned())
                }
                Err(error) => {
                    diagnostics.push(format!("Translation worker check error: {error}"));
                    (false, error)
                }
            }
        }
        (None, _) => (false, "Không tìm thấy Python riêng cho mô-đun dịch. Hãy chạy scripts/import-translation-environment.ps1 hoặc setup-translation-windows.ps1.".to_owned()),
        (_, None) => (false, "Không tìm thấy backend/translation_worker.py.".to_owned()),
    };

    let mut persisted = vec![format!("TRANSLATION CHECK — {}", if ready { "READY" } else { "NOT READY" })];
    persisted.extend(diagnostics.iter().cloned());
    persisted.push(format!("Message: {message}"));
    if let Err(error) = append_log_lines(&app, &persisted) {
        diagnostics.push(format!("Log persistence error: {error}"));
    }

    TranslationEnvironmentResult {
        ready,
        python_path: python.map(|path| path.to_string_lossy().into_owned()),
        worker_path: worker.map(|path| path.to_string_lossy().into_owned()),
        assets_root: assets_root.to_string_lossy().into_owned(),
        output_directory: output.to_string_lossy().into_owned(),
        log_file_path: log_path.to_string_lossy().into_owned(),
        message,
        diagnostics,
    }
}

#[tauri::command]
async fn check_translation_environment(app: tauri::AppHandle) -> Result<TranslationEnvironmentResult, String> {
    tauri::async_runtime::spawn_blocking(move || check_translation_environment_blocking(app))
        .await
        .map_err(|error| format!("Không thể kiểm tra môi trường dịch: {error}"))
}

fn install_translation_environment_blocking(app: tauri::AppHandle) -> Result<TranslationEnvironmentResult, String> {
    #[cfg(not(windows))]
    {
        let _ = app;
        return Err("Trình cài mô-đun dịch lần đầu hiện chỉ hỗ trợ Windows.".to_owned());
    }

    #[cfg(windows)]
    {
        let script = resolve_translation_setup_script(&app)
            .ok_or_else(|| "Không tìm thấy scripts/setup-translation-windows.ps1.".to_owned())?;
        let worker = resolve_translation_worker(&app)
            .ok_or_else(|| "Không tìm thấy backend/translation_worker.py.".to_owned())?;
        let backend = worker.parent().map(Path::to_path_buf)
            .ok_or_else(|| "Không xác định được thư mục backend dịch.".to_owned())?;
        let template = resolve_translation_template(&app)
            .ok_or_else(|| "Không tìm thấy translation-template.".to_owned())?;
        let local_data = app.path().app_local_data_dir()
            .map_err(|error| format!("Không xác định được thư mục dữ liệu ứng dụng: {error}"))?;
        let runtime = local_data.join("translation-runtime");
        let assets = local_data.join("translation").join("assets");
        fs::create_dir_all(&runtime)
            .map_err(|error| format!("Không tạo được thư mục runtime dịch: {error}"))?;
        fs::create_dir_all(&assets)
            .map_err(|error| format!("Không tạo được thư mục tài nguyên dịch: {error}"))?;

        append_log_lines(&app, &[
            "TRANSLATION INSTALL — START".to_owned(),
            format!("Script: {}", script.display()),
            format!("Runtime: {}", runtime.display()),
            format!("Assets: {}", assets.display()),
        ])?;

        let output = configure_command(Path::new("powershell.exe"))
            .arg("-NoProfile")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-File")
            .arg(&script)
            .arg("-ProjectRoot")
            .arg(project_root())
            .arg("-RuntimeRoot")
            .arg(&runtime)
            .arg("-AssetsRoot")
            .arg(&assets)
            .arg("-BackendRoot")
            .arg(&backend)
            .arg("-TemplateRoot")
            .arg(&template)
            .env("PYTHONUTF8", "1")
            .env("PYTHONIOENCODING", "utf-8")
            .output()
            .map_err(|error| format!("Không khởi động được trình cài mô-đun dịch: {error}"))?;
        let stdout = decode_process_output(&output.stdout);
        let stderr = decode_process_output(&output.stderr);
        let summary = vec![
            format!("TRANSLATION INSTALL — {}", if output.status.success() { "OK" } else { "ERROR" }),
            format!("Exit: {}", output.status.code().map_or_else(|| "unknown".to_owned(), |code| code.to_string())),
            format!("stdout: {}", stdout.chars().take(12_000).collect::<String>()),
            format!("stderr: {}", stderr.chars().take(12_000).collect::<String>()),
        ];
        let _ = append_log_lines(&app, &summary);
        if !output.status.success() {
            return Err(format!("Cài mô-đun dịch thất bại. stderr: {} stdout: {}", stderr.trim(), stdout.trim()));
        }

        let checked = check_translation_environment_blocking(app);
        if !checked.ready {
            return Err(format!("Cài đặt đã kết thúc nhưng health check chưa đạt: {}", checked.message));
        }
        Ok(checked)
    }
}

#[tauri::command]
async fn install_translation_environment(app: tauri::AppHandle) -> Result<TranslationEnvironmentResult, String> {
    tauri::async_runtime::spawn_blocking(move || install_translation_environment_blocking(app))
        .await
        .map_err(|error| format!("Trình cài mô-đun dịch bị gián đoạn: {error}"))?
}

fn translate_segments_blocking(app: tauri::AppHandle, request: TranslationRequest) -> Result<Value, String> {
    if !valid_job_id(&request.job_id) {
        return Err("jobId của tác vụ dịch không hợp lệ.".to_owned());
    }
    if request.segments.is_empty() {
        return Err("File lời thoại không có segment để dịch.".to_owned());
    }
    if request.segments.len() > 20_000 {
        return Err("Một lượt dịch không được vượt quá 20.000 segment.".to_owned());
    }
    if request.segments.iter().any(|segment| {
        segment.segment_id.is_empty()
            || segment.source_text.trim().is_empty()
            || segment.end_ms <= segment.start_ms
            || segment.source_text.chars().count() > 8_000
    }) {
        return Err("Dữ liệu segment dịch không hợp lệ.".to_owned());
    }

    let segment_count = request.segments.len();
    let job_id = request.job_id.clone();
    let python = resolve_translation_python(&app)
        .ok_or_else(|| "Không tìm thấy Python riêng cho mô-đun dịch.".to_owned())?;
    let worker = resolve_translation_worker(&app)
        .ok_or_else(|| "Không tìm thấy backend/translation_worker.py.".to_owned())?;
    let assets_root = translation_assets_root(&app);
    let output = translation_output_directory(&app);
    let jobs = output.join("jobs");
    fs::create_dir_all(&jobs)
        .map_err(|error| format!("Không tạo được thư mục tác vụ dịch {}: {error}", jobs.display()))?;
    let checkpoint = jobs.join(format!("{}.checkpoint.json", request.job_id));
    let cancel = jobs.join(format!("{}.cancel", request.job_id));
    if cancel.exists() {
        fs::remove_file(&cancel)
            .map_err(|error| format!("Không reset được cờ hủy {}: {error}", cancel.display()))?;
    }
    let memory = app.path().app_local_data_dir()
        .unwrap_or_else(|_| project_root().join("app-data"))
        .join("translation")
        .join("memory")
        .join("learning.jsonl");
    let payload = json!({
        "jobId": job_id,
        "segments": &request.segments,
        "resume": request.resume,
        "checkpointPath": checkpoint.to_string_lossy(),
        "cancelPath": cancel.to_string_lossy(),
        "memoryPath": memory.to_string_lossy(),
    });
    let started = SystemTime::now();
    let result = run_translation_worker(&app, &python, &worker, &assets_root, false, Some(&payload));
    match result {
        Ok(value) => {
            let status = value.get("status").and_then(Value::as_str).unwrap_or("UNKNOWN");
            let counts = value.get("counts").cloned().unwrap_or(Value::Null);
            let mut lines = vec![
                format!("TRANSLATION RUN — OK — job={} status={status}", request.job_id),
                format!("Python: {}", python.display()),
                format!("Worker: {}", worker.display()),
                format!("Assets: {}", assets_root.display()),
                format!("Segments: {segment_count}"),
                format!("Counts: {counts}"),
                format!("Checkpoint: {}", checkpoint.display()),
                format!("Total backend time: {:.2}s", started.elapsed().unwrap_or_default().as_secs_f64()),
            ];
            if let Some(segments) = value.get("segments").and_then(Value::as_array) {
                for segment in segments {
                    let id = segment.get("segmentId").and_then(Value::as_str).unwrap_or("unknown");
                    let segment_status = segment.get("status").and_then(Value::as_str).unwrap_or("UNKNOWN");
                    let latency = segment.get("latencyMs").and_then(Value::as_f64).unwrap_or_default();
                    let source = segment.get("sourceText").and_then(Value::as_str).unwrap_or("")
                        .replace('\r', " ").replace('\n', " ").chars().take(300).collect::<String>();
                    let target = segment.get("targetText").and_then(Value::as_str).unwrap_or("")
                        .replace('\r', " ").replace('\n', " ").chars().take(300).collect::<String>();
                    lines.push(format!("SEGMENT {id} — {segment_status} — {latency:.2}ms — SOURCE={source} — TARGET={target}"));
                    if let Some(selection) = segment.get("translationSelection").and_then(Value::as_object) {
                        let strategy = selection.get("strategy").and_then(Value::as_str).unwrap_or("unknown");
                        let candidate_count = selection.get("candidateCount").and_then(Value::as_u64).unwrap_or_default();
                        let selected_rank = selection.get("selectedModelRank").and_then(Value::as_u64).unwrap_or_default();
                        let model_score = selection.get("selectedModelScore").and_then(Value::as_f64).unwrap_or_default();
                        let terminology_coverage = selection.get("terminologyCoverage").and_then(Value::as_f64).unwrap_or_default();
                        lines.push(format!(
                            "SEGMENT SELECTION {id} — strategy={strategy} — candidates={candidate_count} — selectedRank={selected_rank} — modelScore={model_score:.4} — terminologyCoverage={terminology_coverage:.2}"
                        ));
                    }
                    if let Some(findings) = segment.get("findings").and_then(Value::as_array) {
                        for finding in findings {
                            let severity = finding.get("severity").and_then(Value::as_str).unwrap_or("UNKNOWN");
                            let kind = finding.get("kind").and_then(Value::as_str).unwrap_or("unknown");
                            let message = finding.get("message").and_then(Value::as_str).unwrap_or("")
                                .replace('\r', " ").replace('\n', " ").chars().take(500).collect::<String>();
                            lines.push(format!("SEGMENT FINDING {id} — {severity} — {kind} — {message}"));
                        }
                    }
                }
            }
            let _ = append_log_lines(&app, &lines);
            Ok(value)
        }
        Err(error) => {
            let lines = vec![
                format!("TRANSLATION RUN — ERROR — job={}", request.job_id),
                format!("Python: {}", python.display()),
                format!("Worker: {}", worker.display()),
                format!("Assets: {}", assets_root.display()),
                format!("Checkpoint: {}", checkpoint.display()),
                format!("Error: {error}"),
            ];
            let _ = append_log_lines(&app, &lines);
            Err(error)
        }
    }
}

#[tauri::command]
async fn translate_segments(app: tauri::AppHandle, request: TranslationRequest) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || translate_segments_blocking(app, request))
        .await
        .map_err(|error| format!("Tác vụ dịch bị gián đoạn: {error}"))?
}

#[tauri::command]
fn save_translation_file(app: tauri::AppHandle, request: SaveTranslationFileRequest) -> Result<SavedTranslationFile, String> {
    if request.content.trim().is_empty() {
        return Err("Nội dung phụ đề dịch đang trống.".to_owned());
    }
    if request.content.len() > 50 * 1024 * 1024 {
        return Err("File phụ đề dịch vượt quá giới hạn 50 MB.".to_owned());
    }
    let output_directory = translation_output_directory(&app).join("files");
    fs::create_dir_all(&output_directory)
        .map_err(|error| format!("Không tạo được thư mục bản dịch {}: {error}", output_directory.display()))?;
    let file_name = safe_translation_file_name(&request.file_name);
    let output_path = output_directory.join(&file_name);
    fs::write(&output_path, request.content.as_bytes())
        .map_err(|error| format!("Không lưu được file bản dịch {}: {error}", output_path.display()))?;
    append_log_lines(&app, &[
        "TRANSLATION FILE — SAVED".to_owned(),
        format!("Path: {}", output_path.display()),
        format!("Bytes: {}", request.content.len()),
    ])?;
    Ok(SavedTranslationFile {
        file_name,
        output_path: output_path.to_string_lossy().into_owned(),
        output_directory: output_directory.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn open_translation_output_directory(app: tauri::AppHandle) -> Result<String, String> {
    let directory = translation_output_directory(&app).join("files");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Không tạo được thư mục bản dịch {}: {error}", directory.display()))?;

    #[cfg(windows)]
    configure_command(Path::new("explorer.exe"))
        .arg(&directory)
        .spawn()
        .map_err(|error| format!("Không mở được thư mục bản dịch: {error}"))?;

    #[cfg(not(windows))]
    configure_command(Path::new("xdg-open"))
        .arg(&directory)
        .spawn()
        .map_err(|error| format!("Không mở được thư mục bản dịch: {error}"))?;

    append_log_lines(&app, &[format!("TRANSLATION DIRECTORY — OPENED — {}", directory.display())])?;
    Ok(directory.to_string_lossy().into_owned())
}

#[tauri::command]
fn cancel_translation(app: tauri::AppHandle, job_id: String) -> Result<(), String> {
    if !valid_job_id(&job_id) {
        return Err("jobId của tác vụ dịch không hợp lệ.".to_owned());
    }
    let path = translation_output_directory(&app)
        .join("jobs")
        .join(format!("{job_id}.cancel"));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Không tạo được thư mục cờ hủy: {error}"))?;
    }
    fs::write(&path, b"cancel\n")
        .map_err(|error| format!("Không ghi được cờ hủy tác vụ dịch: {error}"))?;
    append_log_lines(&app, &[format!("TRANSLATION CANCEL REQUEST — job={job_id}")])
}

#[tauri::command]
fn append_technical_log(app: tauri::AppHandle, lines: Vec<String>) -> Result<(), String> {
    let sanitized = lines.into_iter()
        .take(500)
        .map(|line| line.chars().take(4_000).collect::<String>())
        .collect::<Vec<_>>();
    append_log_lines(&app, &sanitized)
}

#[tauri::command]
fn clear_technical_log(app: tauri::AppHandle) -> Result<(), String> {
    let _guard = LOG_WRITE_LOCK.lock()
        .map_err(|_| "Khóa ghi log đã bị lỗi.".to_owned())?;
    let directory = log_directory(&app);
    let legacy_directory = output_directory(&app)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| project_root().join("output"))
        .join("logs");
    for path in [
        directory.join("ai-rdvd-technical.log"),
        directory.join("ai-rdvd-technical.log.1"),
        legacy_directory.join("ai-rdvd-technical.log"),
        legacy_directory.join("ai-rdvd-technical.log.1"),
    ] {
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|error| format!("Không xóa được file log {}: {error}", path.display()))?;
        }
    }
    Ok(())
}

#[tauri::command]
fn open_technical_log_directory(app: tauri::AppHandle) -> Result<String, String> {
    let directory = log_directory(&app);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Không tạo được thư mục log {}: {error}", directory.display()))?;

    #[cfg(windows)]
    configure_command(Path::new("explorer.exe"))
        .arg(&directory)
        .spawn()
        .map_err(|error| format!("Không mở được File Explorer: {error}"))?;

    #[cfg(not(windows))]
    configure_command(Path::new("xdg-open"))
        .arg(&directory)
        .spawn()
        .map_err(|error| format!("Không mở được thư mục log: {error}"))?;

    Ok(directory.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_voice_preview,
            check_tts_environment,
            generate_tts,
            check_translation_environment,
            install_translation_environment,
            translate_segments,
            cancel_translation,
            save_translation_file,
            open_translation_output_directory,
            append_technical_log,
            clear_technical_log,
            open_technical_log_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running AI RDvD");
}

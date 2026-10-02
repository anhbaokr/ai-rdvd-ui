use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    env,
    fs,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};

const DEFAULT_PROJECT_ROOT: &str = r"E:\ai-rdvd-ui";
const LOG_FILE_NAME: &str = "ai-rdvd-technical.log";
const MAX_LOG_FILE_BYTES: u64 = 5 * 1024 * 1024;
const PROGRESS_PREFIX: &str = "AI_RDVD_PROGRESS:";
const RESULT_PREFIX: &str = "AI_RDVD_RESULT:";
const LOG_PREFIX: &str = "AI_RDVD_LOG:";
static LOG_WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecognitionRequest {
    pub video_path: String,
    pub mode: String,
    pub source_language: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RecognitionLogEvent {
    level: String,
    category: String,
    message: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RecognitionProgress {
    phase: String,
    completed: u64,
    total: u64,
    percent: f64,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecognitionSegment {
    id: u64,
    start: f64,
    end: f64,
    text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecognitionResult {
    status: String,
    mode: String,
    source_language: String,
    engine: String,
    timeline_base_path: String,
    timeline_json_path: String,
    timeline_srt_path: String,
    srt_content: String,
    segments: Vec<RecognitionSegment>,
    detected_count: usize,
    warning: Option<String>,
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
    log_directory(app).join(LOG_FILE_NAME)
}

fn append_log_lines(app: &tauri::AppHandle, lines: &[String]) -> Result<(), String> {
    if lines.is_empty() {
        return Ok(());
    }

    let _guard = LOG_WRITE_LOCK
        .lock()
        .map_err(|_| "Recognition log lock failed.".to_owned())?;

    let directory = log_directory(app);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Cannot create technical log directory {}: {error}", directory.display()))?;

    let path = log_file(app);
    if path.metadata().is_ok_and(|metadata| metadata.len() >= MAX_LOG_FILE_BYTES) {
        let rotated = directory.join(format!("{LOG_FILE_NAME}.1"));
        if rotated.exists() {
            fs::remove_file(&rotated)
                .map_err(|error| format!("Cannot remove rotated log {}: {error}", rotated.display()))?;
        }
        fs::rename(&path, &rotated)
            .map_err(|error| format!("Cannot rotate technical log {}: {error}", path.display()))?;
    }

    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| format!("Cannot open technical log {}: {error}", path.display()))?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    for line in lines {
        use std::io::Write;
        writeln!(file, "[{timestamp}] {line}")
            .map_err(|error| format!("Cannot write technical log {}: {error}", path.display()))?;
    }

    Ok(())
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

fn resolve_python() -> Option<PathBuf> {
    let root = project_root();
    let mut candidates = Vec::new();

    if let Some(value) = env::var_os("AI_RDVD_OCR_PYTHON") {
        candidates.push(PathBuf::from(value));
    }

    if cfg!(windows) {
        candidates.push(root.join("ocr-runtime").join("venv").join("Scripts").join("python.exe"));
        candidates.push(PathBuf::from("python.exe"));
        candidates.push(PathBuf::from("py.exe"));
    } else {
        candidates.push(root.join("ocr-runtime").join("venv").join("bin").join("python"));
        candidates.push(PathBuf::from("python3"));
        candidates.push(PathBuf::from("python"));
    }

    candidates.into_iter().find(|candidate| {
        configure_command(candidate)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|status| status.success())
    })
}

fn resolve_worker() -> Option<PathBuf> {
    let mut candidates = vec![
        project_root().join("backend").join("subtitle_ocr").join("worker.py"),
        env::current_dir().ok()?.join("backend").join("subtitle_ocr").join("worker.py"),
    ];

    candidates.push(
        project_root().join("backend").join("subtitle_ocr").join("worker.py"),
    );

    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn emit_log(app: &tauri::AppHandle, level: &str, category: &str, message: impl Into<String>) {
    let payload = RecognitionLogEvent {
        level: level.to_owned(),
        category: category.to_owned(),
        message: message.into(),
    };
    let _ = app.emit("recognition-log", payload);
}

fn persist_worker_line(app: &tauri::AppHandle, stream: &str, line: &str) {
    let entry = format!("WORKER {stream}: {line}");
    let _ = append_log_lines(app, &[entry]);
}

fn emit_progress(
    app: &tauri::AppHandle,
    phase: &str,
    completed: u64,
    total: u64,
    message: impl Into<String>,
) {
    let percent = if total > 0 {
        (completed as f64 / total as f64 * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };
    let payload = RecognitionProgress {
        phase: phase.to_owned(),
        completed,
        total,
        percent,
        message: message.into(),
    };
    let _ = app.emit("recognition-progress", payload);
}

fn parse_engine_progress(line: &str) -> Option<(u64, u64)> {
    let parts = line.split_whitespace().collect::<Vec<_>>();
    if parts.len() == 4 && parts[0] == "Progress:" && parts[2] == "/" {
        let completed = parts[1].parse::<u64>().ok()?;
        let total = parts[3].parse::<u64>().ok()?;
        return Some((completed, total));
    }
    None
}

fn timeline_paths(base: &Path) -> (PathBuf, PathBuf) {
    (base.with_extension("json"), base.with_extension("srt"))
}

fn parse_timeline(json_text: &str) -> Result<Vec<RecognitionSegment>, String> {
    let values = serde_json::from_str::<Vec<Value>>(json_text)
        .map_err(|error| format!("Không đọc được timeline JSON: {error}"))?;

    let mut segments = Vec::with_capacity(values.len());
    for (index, item) in values.iter().enumerate() {
        let id = item
            .get("id")
            .and_then(Value::as_u64)
            .unwrap_or(index as u64 + 1);
        let start = item
            .get("start")
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
        let end = item
            .get("end")
            .and_then(Value::as_f64)
            .unwrap_or(start + 0.5);
        let text = item
            .get("zh")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_owned();

        if text.is_empty() || end <= start {
            continue;
        }

        segments.push(RecognitionSegment {
            id,
            start,
            end,
            text,
        });
    }

    Ok(segments)
}

fn run_recognition_worker(
    app: &tauri::AppHandle,
    python: &Path,
    request: &RecognitionRequest,
) -> Result<(String, String, Vec<String>), String> {
    let root = project_root();
    let mut command = configure_command(python);
    command
        .current_dir(&root)
        .arg("-m")
        .arg("backend.subtitle_ocr.worker")
        .arg(&request.video_path)
        .arg("--mode")
        .arg(&request.mode)
        .arg("--source-language")
        .arg(&request.source_language)
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUNBUFFERED", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|error| format!("Không khởi động được Recognition Worker: {error}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Không đọc được stdout của Recognition Worker.".to_owned())?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Không đọc được stderr của Recognition Worker.".to_owned())?;

    let stderr_reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stderr.read_to_end(&mut bytes);
        String::from_utf8_lossy(&bytes).into_owned()
    });

    let mut result_payload: Option<Value> = None;
    let mut captured_stdout = Vec::new();

    for line in BufReader::new(stdout).lines() {
        let line = line
            .map_err(|error| format!("Không đọc được output của Recognition Worker: {error}"))?;
        persist_worker_line(app, "STDOUT", &line);

        if let Some(raw) = line.strip_prefix(PROGRESS_PREFIX) {
            captured_stdout.push(line.clone());
            if let Ok(value) = serde_json::from_str::<Value>(raw) {
                if let Some(completed) = value.get("completed").and_then(Value::as_u64) {
                    let total = value.get("total").and_then(Value::as_u64).unwrap_or(0);
                    let message = value
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or("Đang nhận dạng")
                        .to_owned();
                    emit_progress(app, "worker", completed, total, message);
                }
            }
        } else if let Some(raw) = line.strip_prefix(LOG_PREFIX) {
            captured_stdout.push(line.clone());
            if let Ok(value) = serde_json::from_str::<Value>(raw) {
                let level = value.get("level").and_then(Value::as_str).unwrap_or("INFO");
                let category = value.get("category").and_then(Value::as_str).unwrap_or("RECOGNITION");
                let message = value.get("message").and_then(Value::as_str).unwrap_or("");
                if !message.is_empty() {
                    emit_log(app, level, category, message);
                }
            }
        } else if let Some(raw) = line.strip_prefix(RESULT_PREFIX) {
            captured_stdout.push(line.clone());
            result_payload = Some(
                serde_json::from_str::<Value>(raw)
                    .map_err(|error| format!("Không đọc được kết quả Recognition Worker: {error}"))?,
            );
        } else if let Some((completed, total)) = parse_engine_progress(&line) {
            let message = format!("OCR progress: {completed}/{total}");
            emit_progress(app, "ocr", completed, total, message.clone());
            emit_log(app, "INFO", "OCR", message);
            captured_stdout.push(line);
        } else {
            if line.starts_with("Loading PaddleOCR")
                || line.starts_with("Timeline JSON saved:")
                || line.starts_with("Timeline SRT saved:")
                || line.starts_with("VIDEO OPEN FAILED:")
            {
                emit_log(app, "INFO", "OCR", line.clone());
            }
            captured_stdout.push(line);
        }
    }

    let status = child
        .wait()
        .map_err(|error| format!("Recognition Worker bị gián đoạn: {error}"))?;
    let stderr_text = stderr_reader.join().unwrap_or_default();
    for line in stderr_text.lines().map(str::trim).filter(|line| !line.is_empty()) {
        persist_worker_line(app, "STDERR", line);
    }

    if !status.success() {
        return Err(format!(
            "Recognition Worker thất bại (exit {}). stderr: {} stdout: {}",
            status.code().map_or_else(|| "unknown".to_owned(), |code| code.to_string()),
            stderr_text.trim(),
            captured_stdout.join(" | "),
        ));
    }

    let result = result_payload.ok_or_else(|| {
        format!(
            "Recognition Worker không trả về kết quả hợp lệ. stderr: {} stdout: {}",
            stderr_text.trim(),
            captured_stdout.join(" | "),
        )
    })?;

    let timeline_base_path = result
        .get("timelineBasePath")
        .and_then(Value::as_str)
        .ok_or_else(|| "Recognition result thiếu timelineBasePath.".to_owned())?
        .to_owned();

    Ok((timeline_base_path, stderr_text, captured_stdout))
}

fn start_recognition_blocking(
    app: tauri::AppHandle,
    request: RecognitionRequest,
) -> Result<RecognitionResult, String> {
    let mut technical_log = vec![
        "RECOGNITION — START".to_owned(),
        format!("Video: {}", request.video_path),
        format!("Mode: {}", request.mode),
        format!("Source language: {}", request.source_language),
    ];

    if request.source_language != "zh" {
        let message = "Korean OCR worker is not integrated in this baseline.";
        emit_log(&app, "ERROR", "RECOGNITION", message);
        technical_log.push(format!("ERROR: {message}"));
        append_log_lines(&app, &technical_log)?;
        return Err(message.to_owned());
    }

    if request.mode == "voice" {
        let message = "ASR voice recognition is not integrated in this baseline. Select subtitle recognition.";
        emit_log(&app, "ERROR", "RECOGNITION", message);
        technical_log.push(format!("ERROR: {message}"));
        append_log_lines(&app, &technical_log)?;
        return Err(message.to_owned());
    }

    if request.mode != "subtitle" && request.mode != "both" {
        let message = "Recognition mode is not supported.";
        emit_log(&app, "ERROR", "RECOGNITION", message);
        technical_log.push(format!("ERROR: {message}"));
        append_log_lines(&app, &technical_log)?;
        return Err(message.to_owned());
    }

    let video_path = PathBuf::from(&request.video_path);
    if !video_path.is_file() {
        let message = format!("Không tìm thấy video: {}", video_path.display());
        emit_log(&app, "ERROR", "RECOGNITION", &message);
        technical_log.push(format!("ERROR: {message}"));
        append_log_lines(&app, &technical_log)?;
        return Err(message);
    }

    let python = resolve_python()
        .ok_or_else(|| "Không tìm thấy OCR Python runtime. Expected ocr-runtime\\venv\\Scripts\\python.exe.".to_owned())?;
    let worker = resolve_worker()
        .ok_or_else(|| "Không tìm thấy backend/subtitle_ocr/worker.py.".to_owned())?;

    technical_log.push(format!("Python: {}", python.display()));
    technical_log.push(format!("Worker: {}", worker.display()));
    technical_log.push(format!("Worker module: backend.subtitle_ocr.worker"));
    technical_log.push(format!("Worker cwd: {}", project_root().display()));
    technical_log.push("OCR runtime contract: PaddleOCR 2.9.1 / PaddlePaddle 3.0.0 / PP-OCRv4".to_owned());

    emit_log(&app, "INFO", "RECOGNITION", format!("Python: {}", python.display()));
    emit_log(&app, "INFO", "RECOGNITION", "Recognition Worker starting.");
    emit_progress(&app, "starting", 0, 0, "Starting OCR recognition.");

    let run_result = run_recognition_worker(&app, &python, &request);

    let (timeline_base_path, stderr_text, stdout_lines) = match run_result {
        Ok(value) => value,
        Err(error) => {
            technical_log.push(format!("ERROR: {error}"));
            emit_log(&app, "ERROR", "RECOGNITION", &error);
            append_log_lines(&app, &technical_log)?;
            return Err(error);
        }
    };

    technical_log.push(format!("Worker stdout lines captured: {}", stdout_lines.len()));
    technical_log.push(format!("Worker exit: success"));
    if !stderr_text.trim().is_empty() {
        technical_log.push(format!("Worker stderr summary: {}", stderr_text.trim()));
    }
    technical_log.push(format!("Timeline base: {timeline_base_path}"));

    let base_path = PathBuf::from(&timeline_base_path);
    let (json_path, srt_path) = timeline_paths(&base_path);
    let json_text = fs::read_to_string(&json_path)
        .map_err(|error| format!("Không đọc được timeline JSON {}: {error}", json_path.display()))?;
    let srt_content = fs::read_to_string(&srt_path)
        .map_err(|error| format!("Không đọc được timeline SRT {}: {error}", srt_path.display()))?;
    let segments = parse_timeline(&json_text)?;
    let detected_count = segments.len();

    let warning = if request.mode == "both" {
        Some("OCR subtitle recognition completed. Voice/ASR is not integrated in this baseline.".to_owned())
    } else {
        None
    };

    let status = if warning.is_some() {
        "partial".to_owned()
    } else {
        "completed".to_owned()
    };

    emit_progress(
        &app,
        "completed",
        detected_count as u64,
        detected_count.max(1) as u64,
        "Recognition completed.",
    );
    emit_log(
        &app,
        "INFO",
        "RECOGNITION",
        format!("Completed: {detected_count} subtitle segments."),
    );

    technical_log.push(format!("Detected subtitle segments: {detected_count}"));
    technical_log.push(format!("Timeline JSON: {}", json_path.display()));
    technical_log.push(format!("Timeline SRT: {}", srt_path.display()));
    technical_log.push("RECOGNITION — COMPLETED".to_owned());
    append_log_lines(&app, &technical_log)?;

    Ok(RecognitionResult {
        status,
        mode: request.mode.clone(),
        source_language: request.source_language.clone(),
        engine: "PaddleOCR PP-OCRv4".to_owned(),
        timeline_base_path: timeline_base_path.clone(),
        timeline_json_path: json_path.to_string_lossy().into_owned(),
        timeline_srt_path: srt_path.to_string_lossy().into_owned(),
        srt_content,
        segments,
        detected_count,
        warning,
    })
}

#[tauri::command]
pub async fn start_recognition(
    app: tauri::AppHandle,
    request: RecognitionRequest,
) -> Result<RecognitionResult, String> {
    tauri::async_runtime::spawn_blocking(move || start_recognition_blocking(app, request))
        .await
        .map_err(|error| format!("Recognition task bị gián đoạn: {error}"))?
}

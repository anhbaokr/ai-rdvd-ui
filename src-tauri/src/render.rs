use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fmt::Write as _, fs, io::{BufRead, BufReader, Read}, path::{Path, PathBuf}, process::{Child, Command, Stdio}, sync::{Arc, Mutex, OnceLock, atomic::{AtomicBool, Ordering}}, time::Instant};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;
const MAX_DIAGNOSTIC_CHARS: usize = 8_000;

struct ActiveRenderJob {
    child: Arc<Mutex<Child>>,
    cancel_requested: Arc<AtomicBool>,
}

static ACTIVE_RENDER_JOBS: OnceLock<Mutex<HashMap<String, ActiveRenderJob>>> = OnceLock::new();

fn render_jobs() -> &'static Mutex<HashMap<String, ActiveRenderJob>> {
    ACTIVE_RENDER_JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn register_render_job(job_id:&str,child:Arc<Mutex<Child>>,cancel_requested:Arc<AtomicBool>)->Result<RenderJobGuard,RenderError> {
    let mut jobs=render_jobs().lock().map_err(|_|render_error(
        "RENDER_TASK_INTERRUPTED",
        "Không khóa được registry render để đăng ký job.",
    ))?;
    if jobs.contains_key(job_id) {
        return Err(render_error(
            "RENDER_JOB_ALREADY_ACTIVE",
            format!("Render job đã tồn tại trong registry: {job_id}"),
        ));
    }
    jobs.insert(job_id.to_owned(),ActiveRenderJob{child,cancel_requested});
    Ok(RenderJobGuard{job_id:job_id.to_owned()})
}

fn unregister_render_job(job_id:&str) {
    if let Ok(mut jobs)=render_jobs().lock() {
        jobs.remove(job_id);
    }
}

struct RenderJobGuard {
    job_id: String,
}

impl Drop for RenderJobGuard {
    fn drop(&mut self) {
        unregister_render_job(&self.job_id);
    }
}

fn is_active_render_job(job_id:&str)->bool {
    render_jobs()
        .lock()
        .map(|jobs|jobs.contains_key(job_id))
        .unwrap_or(true)
}


#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderEnvironmentResult { pub status: String, pub ready: bool, pub ffmpeg_path: Option<String>, pub ffmpeg_version: Option<String>, pub message: String, pub diagnostics: Vec<String> }
#[derive(Debug, Deserialize)] #[serde(rename_all = "camelCase")] pub struct ExportVideoSettings { codec: String, crf: i32, preset: String }
#[derive(Debug, Deserialize)] #[serde(rename_all = "camelCase")] pub struct ExportAudioSettings { mode: String, source_gain: f64, dubbed_gain: f64, codec: String, bitrate_kbps: u32 }
#[derive(Debug, Deserialize)] #[serde(rename_all = "camelCase")] pub struct ExportSubtitleSegment { id: String, start_ms: i64, end_ms: i64, text: String }
#[derive(Debug, Deserialize)] #[serde(rename_all = "camelCase")] pub struct ExportSubtitleStyle { stage_width: f64, stage_height: f64, x: f64, y: f64, width: f64, height: f64, font_size: f64, text_color: String, background_color: String, background_opacity: f64, outline: bool, outline_width: f64 }
#[derive(Debug, Deserialize)] #[serde(rename_all = "camelCase")] pub struct ExportSubtitleSettings { enabled: bool, segments: Vec<ExportSubtitleSegment>, style: ExportSubtitleStyle }
#[derive(Debug, Deserialize)] #[serde(rename_all = "camelCase")] pub struct ExportLogoSettings { enabled: bool, path: Option<String>, x: f64, y: f64, width: f64, height: f64 }
#[derive(Debug, Deserialize)] #[serde(rename_all = "camelCase")] pub struct ExportRequestV1 { schema_version: u32, job_id: String, source_video_path: String, source_duration_ms: u64, dubbed_audio_path: Option<String>, output_path: String, format: String, video: ExportVideoSettings, audio: ExportAudioSettings, subtitles: ExportSubtitleSettings, logo: ExportLogoSettings }
#[derive(Debug, Serialize)] #[serde(rename_all = "camelCase")] pub struct RenderError { code: String, message: String, diagnostics: Vec<String> }
#[derive(Debug, Clone, Serialize)] #[serde(rename_all = "camelCase")] pub struct RenderLogEvent { job_id: String, level: String, stage: String, message: String }
#[derive(Debug, Serialize)] #[serde(rename_all = "camelCase")] pub struct CancelRenderResult { job_id: String, status: String }
#[derive(Debug, Clone, Serialize)] #[serde(rename_all = "camelCase")] pub struct RenderProgressEvent { job_id: String, status: String, progress: f64, out_time_ms: u64, duration_ms: u64, speed: Option<String> }
#[derive(Debug, Serialize)] #[serde(rename_all = "camelCase")] pub struct RenderResult { job_id: String, status: String, output_path: String, output_bytes: u64, elapsed_ms: u128, ffmpeg_path: String, ffmpeg_version: String }

fn render_error(code: &str, message: impl Into<String>) -> RenderError { RenderError { code: code.to_owned(), message: message.into(), diagnostics: Vec::new() } }
fn render_error_with_diagnostics(code: &str, message: impl Into<String>, diagnostics: Vec<String>) -> RenderError { RenderError { code: code.to_owned(), message: message.into(), diagnostics } }
fn configured_command(path: &Path) -> Command { let mut command = Command::new(path); #[cfg(windows)] { command.creation_flags(CREATE_NO_WINDOW); } command }
fn truncate(value: &str) -> String { value.chars().take(MAX_DIAGNOSTIC_CHARS).collect() }

fn command_version(path: &Path) -> Result<String, String> {
    let output = configured_command(path).arg("-version").output().map_err(|error| format!("Không chạy được FFmpeg {}: {error}", path.display()))?;
    if !output.status.success() { return Err(format!("FFmpeg {} trả mã lỗi {:?}.", path.display(), output.status.code())); }
    let stdout = String::from_utf8_lossy(&output.stdout); let first_line = stdout.lines().next().unwrap_or_default().trim();
    if first_line.is_empty() { return Err(format!("FFmpeg {} không trả thông tin phiên bản.", path.display())); }
    Ok(first_line.to_owned())
}

fn candidate_paths(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() { candidates.push(resource_dir.join("runtime").join("ffmpeg").join("ffmpeg.exe")); candidates.push(resource_dir.join("ffmpeg").join("ffmpeg.exe")); }
    if let Ok(local_data_dir) = app.path().app_local_data_dir() { candidates.push(local_data_dir.join("render-runtime").join("ffmpeg.exe")); candidates.push(local_data_dir.join("ffmpeg").join("ffmpeg.exe")); }
    candidates.push(crate::project_root().join("runtime").join("ffmpeg").join("ffmpeg.exe"));
    candidates
}

fn resolve_ffmpeg(app: &AppHandle) -> Result<(PathBuf, String, Vec<String>), RenderError> {
    let mut diagnostics = Vec::new();
    for path in candidate_paths(app) { diagnostics.push(format!("FFmpeg candidate: {} (file={})", path.display(), path.is_file())); if !path.is_file() { continue; } match command_version(&path) { Ok(version) => return Ok((path, version, diagnostics)), Err(error) => diagnostics.push(error) } }
    diagnostics.push("Fallback: kiểm tra lệnh ffmpeg từ PATH hệ thống.".to_owned());
    let path = PathBuf::from("ffmpeg");
    match command_version(&path) { Ok(version) => Ok((path, version, diagnostics)), Err(error) => { diagnostics.push(error); Err(render_error_with_diagnostics("FFMPEG_NOT_FOUND", "Chưa tìm thấy FFmpeg dùng được cho render.", diagnostics)) } }
}

fn append_render_log(app: &AppHandle, lines: Vec<String>) { let _ = crate::append_log_lines(app, &lines); }

#[tauri::command]
pub fn check_render_environment(app: AppHandle) -> RenderEnvironmentResult {
    match resolve_ffmpeg(&app) {
        Ok((path, version, diagnostics)) => { let result = RenderEnvironmentResult { status: "READY".to_owned(), ready: true, ffmpeg_path: Some(path.to_string_lossy().into_owned()), ffmpeg_version: Some(version.clone()), message: "Môi trường render đã sẵn sàng.".to_owned(), diagnostics }; append_render_log(&app, vec!["RENDER CHECK — READY".to_owned(), format!("FFmpeg: {}", result.ffmpeg_path.as_deref().unwrap_or("unknown")), format!("Version: {version}")]); result }
        Err(error) => { append_render_log(&app, vec!["RENDER CHECK — NOT READY".to_owned(), format!("Code: {}", error.code), error.message.clone()]); RenderEnvironmentResult { status: "NOT_READY".to_owned(), ready: false, ffmpeg_path: None, ffmpeg_version: None, message: error.message, diagnostics: error.diagnostics } }
    }
}

fn valid_job_id(value: &str) -> bool { !value.is_empty() && value.len() <= 64 && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_') }
fn valid_hex_color(value: &str) -> bool { value.len() == 7 && value.starts_with('#') && value[1..].bytes().all(|byte| byte.is_ascii_hexdigit()) }

fn comparable_path_key(path:&Path)->Result<String,RenderError>{
    let resolved=if path.exists(){
        fs::canonicalize(path).map_err(|e|render_error(
            "OUTPUT_PATH_INVALID",
            format!("Không chuẩn hóa được đường dẫn {}: {e}",path.display()),
        ))?
    }else{
        let parent=path.parent().ok_or_else(||render_error(
            "OUTPUT_PATH_INVALID",
            format!("Không xác định được thư mục cha của {}.",path.display()),
        ))?;
        let canonical_parent=fs::canonicalize(parent).map_err(|e|render_error(
            "OUTPUT_PATH_INVALID",
            format!("Không chuẩn hóa được thư mục {}: {e}",parent.display()),
        ))?;
        let name=path.file_name().ok_or_else(||render_error(
            "OUTPUT_PATH_INVALID",
            format!("Đường dẫn không có tên file: {}",path.display()),
        ))?;
        canonical_parent.join(name)
    };

    let value=resolved.to_string_lossy().replace('/',"\\");
    #[cfg(windows)]
    { Ok(value.to_lowercase()) }
    #[cfg(not(windows))]
    { Ok(value.into_owned()) }
}

fn reject_path_conflict(candidate:&Path,candidate_label:&str,protected:&[(&str,&Path)])->Result<(),RenderError>{
    let candidate_key=comparable_path_key(candidate)?;
    for (label,path) in protected {
        if candidate_key==comparable_path_key(path)? {
            return Err(render_error(
                "OUTPUT_PATH_INVALID",
                format!("{candidate_label} không được trùng với {label}: {}",path.display()),
            ));
        }
    }
    Ok(())
}

fn prepare_owned_artifact(path:&Path,label:&str)->Result<(),RenderError>{
    if !path.exists(){ return Ok(()); }
    let metadata=fs::symlink_metadata(path).map_err(|e|render_error(
        "OUTPUT_PATH_INVALID",
        format!("Không kiểm tra được {label} cũ {}: {e}",path.display()),
    ))?;
    if metadata.file_type().is_dir(){
        return Err(render_error(
            "OUTPUT_PATH_INVALID",
            format!("{label} không được là thư mục: {}",path.display()),
        ));
    }
    fs::remove_file(path).map_err(|e|render_error(
        "OUTPUT_PATH_INVALID",
        format!("Không dọn được {label} cũ {}: {e}",path.display()),
    ))
}

fn validate_request(request:&ExportRequestV1)->Result<(PathBuf,Option<PathBuf>,PathBuf),RenderError>{
    if request.schema_version!=1{ return Err(render_error("EXPORT_REQUEST_INVALID","Schema export không được hỗ trợ.")); }
    if !valid_job_id(request.job_id.trim()){ return Err(render_error("EXPORT_REQUEST_INVALID","jobId không hợp lệ.")); }
    if request.format!="mp4" || request.video.codec!="h264" || request.audio.codec!="aac"{ return Err(render_error("EXPORT_REQUEST_INVALID","R5 hỗ trợ MP4/H.264/AAC.")); }
    if !(0..=51).contains(&request.video.crf){ return Err(render_error("EXPORT_REQUEST_INVALID","CRF phải nằm trong 0..51.")); }
    if !matches!(request.video.preset.as_str(),"ultrafast"|"superfast"|"veryfast"|"faster"|"fast"|"medium"|"slow"|"slower"|"veryslow"){ return Err(render_error("EXPORT_REQUEST_INVALID","Preset H.264 không hợp lệ.")); }
    if !(32..=512).contains(&request.audio.bitrate_kbps){ return Err(render_error("EXPORT_REQUEST_INVALID","AAC bitrate phải nằm trong 32..512 kbps.")); }
    if !request.audio.source_gain.is_finite() || request.audio.source_gain<0.0 || !request.audio.dubbed_gain.is_finite() || request.audio.dubbed_gain<0.0{
        return Err(render_error("EXPORT_REQUEST_INVALID","Audio gain không hợp lệ."));
    }
    if !matches!(request.audio.mode.as_str(),"mute"|"keep"|"reduce"){
        return Err(render_error("EXPORT_REQUEST_INVALID","Audio mode không hợp lệ."));
    }
    let source=PathBuf::from(request.source_video_path.trim());
    if !source.is_absolute(){ return Err(render_error("SOURCE_VIDEO_NOT_NATIVE","Video gốc phải có native path.")); }
    if !source.is_file(){ return Err(render_error("SOURCE_VIDEO_MISSING",format!("Không tìm thấy video gốc: {}",source.display()))); }
    let dubbed=request.dubbed_audio_path.as_ref().map(|v|v.trim()).filter(|v|!v.is_empty()).map(PathBuf::from);
    if let Some(p)=dubbed.as_ref(){ if !p.is_absolute() || !p.is_file(){ return Err(render_error("DUBBED_AUDIO_MISSING",format!("Không tìm thấy A2: {}",p.display()))); } if request.audio.mode!="mute"{ return Err(render_error("AUDIO_MODE_NOT_SUPPORTED_YET","A2 hiện dùng mute original; keep/reduce sẽ hoàn thiện ở pha audio-mix.")); } }
    let output=PathBuf::from(request.output_path.trim());
    if !output.is_absolute(){ return Err(render_error("OUTPUT_PATH_INVALID","Output phải là native path tuyệt đối.")); }
    if output.extension().and_then(|v|v.to_str()).map(|v|v.eq_ignore_ascii_case("mp4"))!=Some(true){ return Err(render_error("OUTPUT_PATH_INVALID","Output phải có đuôi .mp4.")); }
    match output.parent(){ Some(p) if p.is_dir()=>{}, _=>return Err(render_error("OUTPUT_PATH_INVALID","Thư mục output không tồn tại.")), }

    let mut protected_paths:Vec<(&str,&Path)>=vec![("video gốc",source.as_path())];
    if let Some(p)=dubbed.as_ref(){ protected_paths.push(("audio lồng tiếng A2",p.as_path())); }
    if request.logo.enabled {
        if let Some(raw)=request.logo.path.as_deref().map(str::trim).filter(|v|!v.is_empty()) {
            let logo=Path::new(raw);
            if logo.is_absolute() && logo.is_file(){ protected_paths.push(("logo",logo)); }
        }
    }
    reject_path_conflict(&output,"Output",&protected_paths)?;
    if output.exists(){ return Err(render_error("OUTPUT_EXISTS","Output đã tồn tại; không ghi đè.")); }
    let valid_color=|v:&str|{let v=v.trim();v.len()==7&&v.starts_with('#')&&v[1..].chars().all(|c|c.is_ascii_hexdigit())};
    if request.subtitles.enabled{ let st=&request.subtitles.style; let vals=[st.stage_width,st.stage_height,st.x,st.y,st.width,st.height,st.font_size,st.background_opacity,st.outline_width]; if vals.iter().any(|v|!v.is_finite())||st.stage_width<=0.0||st.stage_height<=0.0||st.width<=0.0||st.height<=0.0||st.font_size<=0.0{return Err(render_error("SUBTITLE_DATA_INVALID","Thông số phụ đề không hợp lệ."));} if !valid_color(&st.text_color)||!valid_color(&st.background_color){return Err(render_error("SUBTITLE_DATA_INVALID","Màu phụ đề phải là #RRGGBB."));} if request.subtitles.segments.is_empty(){return Err(render_error("SUBTITLE_DATA_INVALID","Subtitle enabled nhưng không có cue."));} for s in &request.subtitles.segments{if s.end_ms<=s.start_ms||s.text.trim().is_empty(){return Err(render_error("SUBTITLE_DATA_INVALID",format!("Cue không hợp lệ: {}",s.id)));}} }
    if request.logo.enabled{ let raw=request.logo.path.as_deref().map(str::trim).filter(|v|!v.is_empty()).ok_or_else(||render_error("LOGO_DATA_INVALID","Logo enabled nhưng thiếu native path."))?; let p=PathBuf::from(raw); if !p.is_absolute()||!p.is_file(){return Err(render_error("LOGO_DATA_INVALID",format!("Không tìm thấy logo: {}",p.display())));} let ext=p.extension().and_then(|v|v.to_str()).unwrap_or_default().to_ascii_lowercase(); if !matches!(ext.as_str(),"png"|"jpg"|"jpeg"|"webp"|"bmp"){return Err(render_error("LOGO_DATA_INVALID","Logo phải là PNG/JPG/JPEG/WEBP/BMP."));} let vals=[request.logo.x,request.logo.y,request.logo.width,request.logo.height]; if vals.iter().any(|v|!v.is_finite())||request.logo.width<=0.0||request.logo.height<=0.0{return Err(render_error("LOGO_DATA_INVALID","Kích thước/vị trí logo không hợp lệ."));} }
    Ok((source,dubbed,output))
}

fn temp_output_path(output: &Path, job_id: &str) -> Result<PathBuf, RenderError> {
    let parent=output.parent().ok_or_else(||render_error(
        "OUTPUT_PATH_INVALID",
        "Không xác định được thư mục chứa output.",
    ))?;
    let stem=output.file_stem().and_then(|value|value.to_str()).unwrap_or("ai-rdvd-output");
    let pid=std::process::id();
    Ok(parent.join(format!(".{stem}.{pid}.{job_id}.airdvd-rendering.tmp.mp4")))
}
fn temp_ass_path(output: &Path, job_id: &str) -> Result<PathBuf, RenderError> {
    let parent=output.parent().ok_or_else(||render_error(
        "OUTPUT_PATH_INVALID",
        "Không xác định được thư mục chứa subtitle tạm.",
    ))?;
    let pid=std::process::id();
    Ok(parent.join(format!(".airdvd.{pid}.{job_id}.subtitle.tmp.ass")))
}
fn parse_hex_rgb(value: &str) -> Result<(u8,u8,u8), RenderError> { if !valid_hex_color(value) { return Err(render_error("SUBTITLE_DATA_INVALID", format!("Màu subtitle không hợp lệ: {value}"))); } let r=u8::from_str_radix(&value[1..3],16).map_err(|_|render_error("SUBTITLE_DATA_INVALID","Không đọc được màu subtitle."))?; let g=u8::from_str_radix(&value[3..5],16).map_err(|_|render_error("SUBTITLE_DATA_INVALID","Không đọc được màu subtitle."))?; let b=u8::from_str_radix(&value[5..7],16).map_err(|_|render_error("SUBTITLE_DATA_INVALID","Không đọc được màu subtitle."))?; Ok((r,g,b)) }
fn ass_color(value: &str, opacity: f64) -> Result<String, RenderError> { let (r,g,b)=parse_hex_rgb(value)?; let alpha=((1.0-opacity.clamp(0.0,1.0))*255.0).round() as u8; Ok(format!("&H{alpha:02X}{b:02X}{g:02X}{r:02X}")) }
fn ass_time(cs:i64)->String{ let s=cs.max(0); format!("{}:{:02}:{:02}.{:02}",s/360000,(s%360000)/6000,(s%6000)/100,s%100) }
fn ass_escape_text(value:&str)->String{ value.replace('\\',"\\\\").replace('{',"\\{").replace('}',"\\}").replace("\r\n","\\N").replace('\n',"\\N").replace('\r',"\\N") }
fn display_units(value:&str)->f64{ value.chars().fold(0.0,|t,c| t + if c.is_whitespace(){0.35}else if ".,!?;:…".contains(c){0.45}else{1.0}) }
fn subtitle_scale_x(style:&ExportSubtitleStyle,text:&str)->f64{ let est=(display_units(text)*style.font_size*0.58).max(1.0); let avail=(style.width*0.94).max(1.0); ((avail/est)*100.0).clamp(35.0,90.0) }

fn build_ass(request:&ExportRequestV1)->Result<String,RenderError>{
    let style=&request.subtitles.style; let x=style.x.clamp(0.0,style.stage_width).round() as i64; let y=style.y.clamp(0.0,style.stage_height).round() as i64; let fs=style.font_size.clamp(1.0,300.0); let text=ass_color(&style.text_color,1.0)?; let bg=ass_color(&style.background_color,style.background_opacity)?; let transparent="&HFF000000"; let outline=ass_color("#050505",1.0)?; let bord=if style.outline{style.outline_width.clamp(0.0,30.0)}else{0.0}; let pad=(style.outline_width+3.0).clamp(3.0,18.0); let mut a=String::new();
    writeln!(&mut a,"[Script Info]\nScriptType: v4.00+\nPlayResX: {}\nPlayResY: {}\nWrapStyle: 2\nScaledBorderAndShadow: yes\nYCbCr Matrix: TV.709\n",style.stage_width.round().max(1.0) as i64,style.stage_height.round().max(1.0) as i64).ok();
    writeln!(&mut a,"[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding").ok();
    writeln!(&mut a,"Style: Background,Arial,{fs:.2},{transparent},{transparent},{bg},{bg},0,0,0,0,100,100,0,0,3,{pad:.2},0,5,0,0,0,1").ok();
    writeln!(&mut a,"Style: Foreground,Arial,{fs:.2},{text},{text},{outline},{transparent},-1,0,0,0,100,100,0,0,1,{bord:.2},0,5,0,0,0,1\n").ok();
    writeln!(&mut a,"[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text").ok();
    for seg in &request.subtitles.segments { let sc=((seg.start_ms+5)/10).max(0); let ec=((seg.end_ms+5)/10).max(sc+1); let display_text=seg.text.trim().to_uppercase(); let tx=ass_escape_text(&display_text); let sx=subtitle_scale_x(style,&display_text); let tags=format!("{{\\an5\\pos({x},{y})\\fscx{sx:.2}\\fscy100\\fax-0.087}}"); if false && style.background_opacity>0.001 { writeln!(&mut a,"Dialogue: 0,{},{},Background,,0,0,0,,{}{}",ass_time(sc),ass_time(ec),tags,tx).ok(); } writeln!(&mut a,"Dialogue: 1,{},{},Foreground,,0,0,0,,{}{}",ass_time(sc),ass_time(ec),tags,tx).ok(); }
    Ok(a)
}

fn ffmpeg_filter_escape_path(path:&Path)->String{ path.to_string_lossy().replace('\\',"/").replace(':',"\\:").replace('\'',"\\'").replace(',',"\\,").replace(';',"\\;").replace('[',"\\[").replace(']',"\\]") }
fn cleanup(path:&Path)->bool{
    if !path.exists(){ return true; }
    fs::remove_file(path).is_ok() && !path.exists()
}

fn parse_render_artifact_owner(name:&str)->Option<(u32,String)> {
    const VIDEO_SUFFIX:&str=".airdvd-rendering.tmp.mp4";
    const ASS_PREFIX:&str=".airdvd.";
    const ASS_SUFFIX:&str=".subtitle.tmp.ass";

    if let Some(prefix)=name.strip_suffix(VIDEO_SUFFIX) {
        let (before_job,job_id)=prefix.rsplit_once('.')?;
        let (_,pid_text)=before_job.rsplit_once('.')?;
        if !valid_job_id(job_id){ return None; }
        let pid=pid_text.parse::<u32>().ok()?;
        if pid==0{ return None; }
        return Some((pid,job_id.to_owned()));
    }

    if let Some(body)=name.strip_prefix(ASS_PREFIX).and_then(|v|v.strip_suffix(ASS_SUFFIX)) {
        let (pid_text,job_id)=body.split_once('.')?;
        if !valid_job_id(job_id){ return None; }
        let pid=pid_text.parse::<u32>().ok()?;
        if pid==0{ return None; }
        return Some((pid,job_id.to_owned()));
    }

    None
}

#[cfg(windows)]
fn process_is_alive(pid:u32)->bool {
    use std::os::windows::process::CommandExt;
    let filter=format!("PID eq {pid}");
    let output=Command::new("tasklist")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["/FI",filter.as_str(),"/FO","CSV","/NH"])
        .output();

    let Ok(output)=output else { return true; };
    if !output.status.success(){ return true; }
    let text=String::from_utf8_lossy(&output.stdout);
    let marker=format!(",\"{pid}\",");
    text.lines().any(|line|line.contains(&marker))
}

#[cfg(not(windows))]
fn process_is_alive(pid:u32)->bool {
    PathBuf::from(format!("/proc/{pid}")).exists()
}

fn recover_stale_render_artifacts(directory:&Path,current_job_id:&str)->Vec<(&'static str,String)> {
    let mut messages=Vec::new();
    let current_pid=std::process::id();
    let entries=match fs::read_dir(directory) {
        Ok(entries)=>entries,
        Err(error)=>{
            messages.push(("WARN",format!(
                "Không quét được stale render artifacts trong {}: {error}",
                directory.display()
            )));
            return messages;
        }
    };

    for entry in entries.flatten() {
        let Ok(file_type)=entry.file_type() else { continue; };
        if !file_type.is_file(){ continue; }
        let name=entry.file_name();
        let Some(name)=name.to_str() else { continue; };
        let Some((owner_pid,owner_job_id))=parse_render_artifact_owner(name) else { continue; };

        if owner_job_id==current_job_id { continue; }
        if owner_pid==current_pid && is_active_render_job(&owner_job_id) { continue; }
        if owner_pid!=current_pid && process_is_alive(owner_pid) { continue; }

        let path=entry.path();
        if cleanup(&path) {
            messages.push(("INFO",format!(
                "Recovered stale render artifact: {} (pid={owner_pid}, job={owner_job_id})",
                path.display()
            )));
        }else{
            messages.push(("WARN",format!(
                "Không dọn được stale render artifact: {} (pid={owner_pid}, job={owner_job_id})",
                path.display()
            )));
        }
    }
    messages
}

fn emit_render_progress(app:&AppHandle,job_id:&str,status:&str,progress:f64,out_time_ms:u64,duration_ms:u64,speed:Option<String>){
    let payload=RenderProgressEvent{job_id:job_id.to_owned(),status:status.to_owned(),progress:progress.clamp(0.0,100.0),out_time_ms,duration_ms,speed};
    let _=app.emit("render-progress",payload);
}

fn emit_render_log(app:&AppHandle,job_id:&str,level:&str,stage:&str,message:impl Into<String>){
    let payload=RenderLogEvent{job_id:job_id.to_owned(),level:level.to_owned(),stage:stage.to_owned(),message:message.into()};
    let _=app.emit("render-log",payload);
}

fn start_render_blocking(app:AppHandle,request:ExportRequestV1)->Result<RenderResult,RenderError>{
    let started=Instant::now(); let duration_ms=request.source_duration_ms.max(1);
    emit_render_progress(&app,&request.job_id,"PREPARING",0.0,0,duration_ms,None);
    emit_render_log(&app,&request.job_id,"INFO","PREPARING","Đang kiểm tra request và xây dựng render plan.");
    let (source,dubbed,output)=validate_request(&request)?;
    let audio_plan=if dubbed.is_some(){"A2_DUBBED"}else{"A1_ORIGINAL"}; let subtitle_plan=if request.subtitles.enabled{"ON"}else{"OFF"}; let logo_plan=if request.logo.enabled{"ON"}else{"OFF"};
    emit_render_log(&app,&request.job_id,"INFO","PREPARING",format!("Resolved plan: VIDEO=SOURCE AUDIO={audio_plan} SUBTITLE={subtitle_plan} LOGO={logo_plan}"));
    emit_render_log(&app,&request.job_id,"INFO","PREPARING",format!("Source: {}",source.display()));
    emit_render_log(&app,&request.job_id,"INFO","PREPARING",format!("Output: {}",output.display()));
    let (ffmpeg,ffmpeg_version,_)=resolve_ffmpeg(&app)?; emit_render_log(&app,&request.job_id,"INFO","PREPARING",format!("FFmpeg: {ffmpeg_version}"));
    let logo_path=if request.logo.enabled{request.logo.path.as_deref().map(PathBuf::from)}else{None};
    let temp=temp_output_path(&output,&request.job_id)?;
    if let Some(directory)=output.parent() {
        for (level,message) in recover_stale_render_artifacts(directory,&request.job_id) {
            emit_render_log(&app,&request.job_id,level,"RECOVERY",message);
        }
    }
    let mut protected_paths:Vec<(&str,&Path)>=vec![("video gốc",source.as_path()),("output cuối",output.as_path())];
    if let Some(p)=dubbed.as_ref(){ protected_paths.push(("audio lồng tiếng A2",p.as_path())); }
    if let Some(p)=logo_path.as_ref(){ protected_paths.push(("logo",p.as_path())); }
    reject_path_conflict(&temp,"Temp output",&protected_paths)?;
    prepare_owned_artifact(&temp,"temp output")?;
    emit_render_log(&app,&request.job_id,"INFO","PREPARING",format!("Temp output ready: {}",temp.display()));

    let ass_path=if request.subtitles.enabled{
        let p=temp_ass_path(&output,&request.job_id)?;
        reject_path_conflict(&p,"ASS tạm",&protected_paths)?;
        reject_path_conflict(&p,"ASS tạm",&[("temp output",temp.as_path())])?;
        prepare_owned_artifact(&p,"ASS tạm")?;
        let ass=build_ass(&request)?;
        fs::write(&p,ass).map_err(|e|{
            cleanup(&p);
            render_error("SUBTITLE_DATA_INVALID",format!("Không ghi được ASS tạm {}: {e}",p.display()))
        })?;
        emit_render_log(&app,&request.job_id,"INFO","PREPARING",format!("ASS ready: {} cues",request.subtitles.segments.len()));
        Some(p)
    }else{None};
    append_render_log(&app,vec![format!("RENDER START — job={}",request.job_id),format!("SourceVideo: {}",source.display()),format!("DubbedAudio: {}",dubbed.as_ref().map(|p|p.display().to_string()).unwrap_or_else(||"<ORIGINAL_A1>".to_owned())),format!("Output: {}",output.display()),format!("S1: enabled={} cues={}",request.subtitles.enabled,request.subtitles.segments.len()),format!("Logo: enabled={} path={}",request.logo.enabled,request.logo.path.as_deref().unwrap_or("")),format!("AudioPlan: {audio_plan}"),format!("FFmpegVersion: {ffmpeg_version}")]);
    let mut cmd=configured_command(&ffmpeg); cmd.arg("-hide_banner").arg("-nostdin").arg("-loglevel").arg("error").arg("-n").arg("-i").arg(&source);
    let dubbed_input_index=if let Some(p)=dubbed.as_ref(){cmd.arg("-i").arg(p);Some(1usize)}else{None};
    let logo_input_index=if let Some(p)=logo_path.as_ref(){let idx=if dubbed_input_index.is_some(){2usize}else{1usize};cmd.arg("-i").arg(p);Some(idx)}else{None};
    let st=&request.subtitles.style;
    let subtitle_chain=ass_path.as_ref().map(|p|{let bx=((st.x-st.width/2.0)/st.stage_width).clamp(0.0,1.0);let by=((st.y-st.height/2.0)/st.stage_height).clamp(0.0,1.0);let bw=(st.width/st.stage_width).clamp(0.0,1.0-bx);let bh=(st.height/st.stage_height).clamp(0.0,1.0-by);let mc=st.background_color.trim_start_matches('#');let ma=st.background_opacity.clamp(0.0,1.0);let ap=ffmpeg_filter_escape_path(p);format!("drawbox=x=iw*{bx:.8}:y=ih*{by:.8}:w=iw*{bw:.8}:h=ih*{bh:.8}:color=0x{mc}@{ma:.4}:t=fill,ass=filename='{ap}'")});
    if let Some(logo_idx)=logo_input_index{let lg=&request.logo;let lx=((lg.x-lg.width/2.0)/st.stage_width).clamp(0.0,1.0);let ly=((lg.y-lg.height/2.0)/st.stage_height).clamp(0.0,1.0);let lw=(lg.width/st.stage_width).clamp(0.001,1.0);let lh=(lg.height/st.stage_height).clamp(0.001,1.0);let fc=if let Some(chain)=subtitle_chain.as_ref(){format!("[0:v]{chain}[base];[{logo_idx}:v][base]scale2ref=w=iw*{lw:.8}:h=ih*{lh:.8}[logo][base2];[base2][logo]overlay=x=main_w*{lx:.8}:y=main_h*{ly:.8}:eof_action=repeat:repeatlast=1:format=auto[outv]")}else{format!("[{logo_idx}:v][0:v]scale2ref=w=iw*{lw:.8}:h=ih*{lh:.8}[logo][base];[base][logo]overlay=x=main_w*{lx:.8}:y=main_h*{ly:.8}:eof_action=repeat:repeatlast=1:format=auto[outv]")};cmd.arg("-filter_complex").arg(fc);}else if let Some(chain)=subtitle_chain.as_ref(){cmd.arg("-vf").arg(chain);}
    let video_map=if logo_input_index.is_some(){"[outv]"}else{"0:v:0"}; cmd.arg("-map").arg(video_map);
    if let Some(idx)=dubbed_input_index{cmd.arg("-map").arg(format!("{idx}:a:0"));}else{cmd.arg("-map").arg("0:a:0?");}
    let bitrate=format!("{}k",request.audio.bitrate_kbps);let crf=request.video.crf.to_string();cmd.arg("-c:v").arg("libx264").arg("-crf").arg(&crf).arg("-preset").arg(&request.video.preset).arg("-pix_fmt").arg("yuv420p");if dubbed_input_index.is_some(){cmd.arg("-af").arg("apad");}cmd.arg("-c:a").arg("aac").arg("-b:a").arg(&bitrate).arg("-shortest").arg("-movflags").arg("+faststart").arg("-progress").arg("pipe:1").arg("-nostats").arg(&temp).stdout(Stdio::piped()).stderr(Stdio::piped());
    emit_render_log(&app,&request.job_id,"INFO","RENDERING",format!("Encoder start: H.264 CRF={} preset={} / AAC {} kbps / audio={audio_plan}",request.video.crf,request.video.preset,request.audio.bitrate_kbps));emit_render_progress(&app,&request.job_id,"RENDERING",0.0,0,duration_ms,None);
    let mut child=cmd.spawn().map_err(|e|{cleanup(&temp);if let Some(p)=ass_path.as_ref(){cleanup(p);}render_error("FFMPEG_START_FAILED",format!("Không khởi động được FFmpeg: {e}"))})?;
    let stdout=child.stdout.take().ok_or_else(||{cleanup(&temp);if let Some(p)=ass_path.as_ref(){cleanup(p);}render_error("FFMPEG_START_FAILED","Không đọc được FFmpeg progress pipe.")})?;let stderr=child.stderr.take().ok_or_else(||{cleanup(&temp);if let Some(p)=ass_path.as_ref(){cleanup(p);}render_error("FFMPEG_START_FAILED","Không đọc được FFmpeg stderr.")})?;
    let child=Arc::new(Mutex::new(child));let cancel_requested=Arc::new(AtomicBool::new(false));let _job_guard=register_render_job(&request.job_id,child.clone(),cancel_requested.clone())?;
    let stderr_thread=std::thread::spawn(move||{let mut text=String::new();let _=BufReader::new(stderr).read_to_string(&mut text);text});
    let mut out_time_ms=0_u64;let mut speed:Option<String>=None;for line in BufReader::new(stdout).lines(){let line=line.unwrap_or_default();if let Some(v)=line.strip_prefix("out_time_us=").or_else(||line.strip_prefix("out_time_ms=")){if let Ok(us)=v.trim().parse::<u64>(){out_time_ms=us/1000;}}else if let Some(v)=line.strip_prefix("speed="){let v=v.trim();speed=if v.is_empty()||v=="N/A"{None}else{Some(v.to_owned())};}else if let Some(v)=line.strip_prefix("progress="){let raw=(out_time_ms as f64/duration_ms as f64)*100.0;let pct=if v.trim()=="end"{99.5}else{raw.clamp(0.0,99.5)};emit_render_progress(&app,&request.job_id,"RENDERING",pct,out_time_ms,duration_ms,speed.clone());}}
    let wait_result={let mut locked=child.lock().map_err(|_|render_error("FFMPEG_EXIT_FAILED","Không khóa được tiến trình FFmpeg."))?;locked.wait()};let status=wait_result.map_err(|e|{cleanup(&temp);if let Some(p)=ass_path.as_ref(){cleanup(p);}render_error("FFMPEG_EXIT_FAILED",format!("Không chờ được FFmpeg: {e}"))})?;let stderr_text=stderr_thread.join().unwrap_or_default();
    if cancel_requested.load(Ordering::SeqCst){
        let temp_clean=cleanup(&temp);
        let ass_clean=ass_path.as_ref().map(|p|cleanup(p)).unwrap_or(true);
        let pct=((out_time_ms as f64/duration_ms as f64)*100.0).clamp(0.0,99.5);
        emit_render_progress(&app,&request.job_id,"CANCELLED",pct,out_time_ms,duration_ms,speed.clone());
        if temp_clean && ass_clean {
            emit_render_log(&app,&request.job_id,"INFO","CANCEL","FFmpeg đã dừng; temp output và ASS tạm đã được dọn.");
        }else{
            emit_render_log(&app,&request.job_id,"WARN","CANCEL",format!("FFmpeg đã dừng nhưng cleanup chưa hoàn tất: tempClean={temp_clean} assClean={ass_clean}"));
        }
        append_render_log(&app,vec![format!("RENDER CANCELLED — job={}",request.job_id)]);
        return Err(render_error("RENDER_CANCELLED","Đã hủy xuất video."));
    }
    if let Some(p)=ass_path.as_ref(){cleanup(p);}if !status.success(){let stderr=truncate(&stderr_text);cleanup(&temp);emit_render_log(&app,&request.job_id,"ERROR","ERROR",format!("FFmpeg exit={:?}: {stderr}",status.code()));return Err(render_error_with_diagnostics("FFMPEG_EXIT_FAILED","FFmpeg kết thúc với mã lỗi.",vec![format!("ExitCode: {:?}",status.code()),format!("stderr: {stderr}"),format!("ProgressOutTimeMs: {out_time_ms}")]));}
    emit_render_progress(&app,&request.job_id,"FINALIZING",99.7,duration_ms,duration_ms,speed.clone());emit_render_log(&app,&request.job_id,"INFO","FINALIZING","Encoder đã xong; đang kiểm tra temp output và finalize file.");
    let temp_meta=fs::metadata(&temp).map_err(|e|render_error("FINALIZE_FAILED",format!("Không đọc được temp output {}: {e}",temp.display())))?;
    let temp_bytes=temp_meta.len();
    if temp_bytes==0{
        cleanup(&temp);
        return Err(render_error("FINALIZE_FAILED","Temp output có kích thước 0 byte."));
    }
    if output.exists(){
        cleanup(&temp);
        return Err(render_error("OUTPUT_EXISTS","Output xuất hiện trong lúc render; không ghi đè."));
    }
    fs::rename(&temp,&output).map_err(|e|{
        cleanup(&temp);
        render_error("FINALIZE_FAILED",format!("Không finalize được output {} → {}: {e}",temp.display(),output.display()))
    })?;
    let meta=fs::metadata(&output).map_err(|e|render_error("FINALIZE_FAILED",format!("Không đọc được output sau finalize: {e}")))?;
    if meta.len()==0 || meta.len()!=temp_bytes{
        return Err(render_error(
            "FINALIZE_FAILED",
            format!("Output sau finalize không khớp temp: expected={temp_bytes} actual={}.",meta.len()),
        ));
    }
    emit_render_log(&app,&request.job_id,"INFO","FINALIZING",format!("Finalize verified: {} bytes",meta.len()));
    let result=RenderResult{job_id:request.job_id.clone(),status:"COMPLETED".to_owned(),output_path:output.to_string_lossy().into_owned(),output_bytes:meta.len(),elapsed_ms:started.elapsed().as_millis(),ffmpeg_path:ffmpeg.to_string_lossy().into_owned(),ffmpeg_version};emit_render_progress(&app,&request.job_id,"COMPLETED",100.0,duration_ms,duration_ms,speed);emit_render_log(&app,&request.job_id,"INFO","COMPLETED",format!("Render hoàn tất: {} bytes / {} ms",result.output_bytes,result.elapsed_ms));append_render_log(&app,vec![format!("RENDER COMPLETED — job={}",request.job_id),format!("Output: {}",result.output_path),format!("S1Burned: {}",request.subtitles.enabled),format!("LogoBurned: {}",request.logo.enabled),format!("AudioPlan: {audio_plan}")]);Ok(result)
}

#[tauri::command]
pub async fn cancel_render(app:AppHandle,job_id:String)->Result<CancelRenderResult,RenderError>{
    let (child,cancel_requested)={let jobs=render_jobs().lock().map_err(|_|render_error("RENDER_TASK_INTERRUPTED","Không khóa được registry render."))?;match jobs.get(&job_id){Some(job)=>(job.child.clone(),job.cancel_requested.clone()),None=>return Ok(CancelRenderResult{job_id,status:"NOT_FOUND".to_owned()}),}};
    cancel_requested.store(true,Ordering::SeqCst);emit_render_log(&app,&job_id,"INFO","CANCEL","Đã nhận yêu cầu hủy; đang dừng FFmpeg.");{let mut child=child.lock().map_err(|_|render_error("RENDER_TASK_INTERRUPTED","Không khóa được tiến trình FFmpeg để hủy."))?;let _=child.kill();}Ok(CancelRenderResult{job_id,status:"CANCEL_REQUESTED".to_owned()})
}

#[tauri::command]
pub async fn start_render(app:AppHandle,request:ExportRequestV1)->Result<RenderResult,RenderError>{
    let job_id=request.job_id.clone();
    let duration_ms=request.source_duration_ms.max(1);

    if let Err(error)=crate::protected_access::authorize_protected_command(&app,"render").await {
        return Err(render_error("ACCESS_DENIED",error));
    }

    if let Err(initial_error)=resolve_ffmpeg(&app) {
        emit_render_progress(&app,&job_id,"PREPARING",0.0,0,duration_ms,None);
        emit_render_log(
            &app,
            &job_id,
            "INFO",
            "AUTO_PROVISION",
            "FFmpeg chưa sẵn sàng; AI RDvD đang tự động bổ sung runtime còn thiếu.",
        );
        append_render_log(&app,vec![
            format!("FFMPEG AUTO PROVISION — START — job={job_id}"),
            format!("InitialCode: {}",initial_error.code),
            format!("InitialMessage: {}",initial_error.message),
        ]);

        match crate::runtime_manager::provision_runtime_module(app.clone(),"ffmpeg".to_owned()).await {
            Ok(_) => {
                match resolve_ffmpeg(&app) {
                    Ok((path,version,_)) => {
                        emit_render_log(
                            &app,
                            &job_id,
                            "INFO",
                            "AUTO_PROVISION",
                            format!("FFmpeg đã sẵn sàng: {} — {}",path.display(),version),
                        );
                        append_render_log(&app,vec![
                            format!("FFMPEG AUTO PROVISION — READY — job={job_id}"),
                            format!("FFmpeg: {}",path.display()),
                            format!("Version: {version}"),
                        ]);
                    }
                    Err(after_error) => {
                        let mut diagnostics=initial_error.diagnostics;
                        diagnostics.push(format!("Initial message: {}",initial_error.message));
                        diagnostics.push(format!("Post-provision message: {}",after_error.message));
                        diagnostics.extend(after_error.diagnostics);
                        return Err(render_error_with_diagnostics(
                            "FFMPEG_AUTO_PROVISION_FAILED",
                            "Đã bổ sung FFmpeg nhưng render environment vẫn chưa READY.",
                            diagnostics,
                        ));
                    }
                }
            }
            Err(provision_error) => {
                let mut diagnostics=initial_error.diagnostics;
                diagnostics.push(format!("Initial message: {}",initial_error.message));
                diagnostics.push(format!("Auto-provision error: {provision_error}"));
                emit_render_log(
                    &app,
                    &job_id,
                    "ERROR",
                    "AUTO_PROVISION",
                    format!("Không thể tự động bổ sung FFmpeg: {provision_error}"),
                );
                append_render_log(&app,vec![
                    format!("FFMPEG AUTO PROVISION — ERROR — job={job_id}"),
                    format!("Error: {provision_error}"),
                ]);
                return Err(render_error_with_diagnostics(
                    "FFMPEG_AUTO_PROVISION_FAILED",
                    "Không thể tự động bổ sung FFmpeg còn thiếu cho render.",
                    diagnostics,
                ));
            }
        }
    }

    tauri::async_runtime::spawn_blocking(move||start_render_blocking(app,request))
        .await
        .map_err(|e|render_error(
            "RENDER_TASK_INTERRUPTED",
            format!("Tác vụ render bị gián đoạn: {e}"),
        ))?
}

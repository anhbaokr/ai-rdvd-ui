# AI RDvD — KẾ HOẠCH TRIỂN KHAI RENDER / EXPORT VIDEO

**Baseline:** `bb2f27c8aa6113a56290795db5f4370fd06641db`  
**Tag baseline:** `checkpoint/application-baseline-2026-10-10`  
**Phiên bản ứng dụng:** `0.1.5`  
**Ngày lập kế hoạch:** 2026-10-10

> File này là tài liệu điều hướng cố định cho phần Render/Export. Khi đổi phiên làm việc, phải đọc file này trước và cập nhật trạng thái sau mỗi phase.

---

## 1. Mục tiêu

Luồng hiện tại:

```text
Video nguồn
→ OCR phụ đề Trung
→ dịch Trung → Việt
→ review/approve
→ VieNeu TTS
→ WAV lồng tiếng
→ Preview + Timeline
```

Phần cần bổ sung:

```text
Video nguồn
+ audio gốc A1
+ audio lồng tiếng A2
+ phụ đề Việt S1
+ logo
+ thiết lập xuất
→ FFmpeg render
→ MP4 hoàn chỉnh
```

Hiện nút Export mới là placeholder, chưa encode video thật.

---

## 2. Nguyên tắc không được phá

1. Không thay đổi Payment Gateway trong phần render.
2. Không thay đổi License/Activation/Renewal.
3. Không thay đổi Machine ID.
4. Không làm yếu updater signature.
5. Không log token/secret.
6. Giữ nguyên ID/timecode OCR → Translation → TTS → Timeline → Render.
7. Render lỗi không được ảnh hưởng Payment/License.
8. Render lỗi không được làm mất video nguồn/WAV TTS.
9. Luôn render ra temp file trước rồi mới finalize.
10. Mỗi patch: sửa → build/test → PASS/FAIL → mới sang bước tiếp.

---

## 3. MVP được coi là hoàn thành khi

Ứng dụng có thể:

1. nhận native path của video nguồn;
2. nhận native path WAV A2;
3. áp dụng audio mode;
4. burn subtitle Việt;
5. overlay logo nếu có;
6. xuất MP4 H.264 + AAC;
7. hiển thị progress;
8. hỗ trợ Cancel;
9. báo lỗi rõ ràng;
10. không để file lỗi thành output hoàn chỉnh;
11. mở thư mục output;
12. giữ đồng bộ V1/S1/A2.

---

## 4. Kiến trúc

### React / TypeScript
- UI export
- output settings
- progress/cancel
- tạo `ExportRequest`
- hiển thị kết quả/lỗi

### Tauri / Rust
- tìm FFmpeg
- validate native path
- temp workspace
- sinh ASS subtitle
- build FFmpeg args
- spawn/cancel process
- parse progress
- technical logging
- finalize output

### FFmpeg
- video encode
- audio mix
- subtitle burn-in
- logo overlay
- mux output

Không chạy FFmpeg trực tiếp từ React.

---

## 5. FFmpeg runtime

Thứ tự discovery:

1. FFmpeg bundle cùng app
2. app-local runtime
3. `runtime/ffmpeg/ffmpeg.exe` khi develop
4. `ffmpeg` trong PATH làm fallback dev

Production không được phụ thuộc ngẫu nhiên vào FFmpeg cài ngoài máy.

Trước release production phải chốt:
- version/build FFmpeg
- SHA-256
- nguồn/provenance
- license/redistribution notices

---

## 6. ExportRequest dự kiến

```ts
interface ExportRequest {
  jobId: string;
  sourceVideoPath: string;
  dubbedAudioPath: string | null;
  outputPath: string;
  format: 'mp4';

  video: {
    codec: 'h264';
    crf: number;
    preset: string;
  };

  audio: {
    mode: 'reduce' | 'keep' | 'mute';
    sourceGain: number;
    dubbedGain: number;
    codec: 'aac';
    bitrateKbps: number;
  };

  subtitles: {
    enabled: boolean;
    segments: Array<{
      id: string;
      startMs: number;
      endMs: number;
      text: string;
    }>;
  };

  logo: {
    enabled: boolean;
    path: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

---

## 7. Native path

### Video
`videoPath` phải là path native thật. Nếu chỉ có browser File/Object URL thì preview được nhưng chưa render được.

### TTS
TTS hiện đã trả `outputPath` native, dùng trực tiếp được.

### Logo
Logo hiện chưa giữ native path ổn định. Cần đổi import logo sang native Tauri picker hoặc materialize ảnh sang file do app quản lý.

---

## 8. Subtitle

Dùng ASS trung gian:

```text
subtitleSegments
→ Rust sinh .ass UTF-8
→ FFmpeg/libass burn vào video
```

Phải giữ:
- timing
- nội dung đã edit
- tiếng Việt có dấu
- màu
- outline
- vị trí gần tương đương Preview

MVP chưa cần pixel-perfect.

---

## 9. Audio policy

### `mute`
```text
A1 = bỏ
A2 = dùng
```

### `keep`
```text
A1 = 1.0
A2 = 1.0
```

### `reduce`
MVP:
```text
A1 = 0.20–0.30
A2 = 1.0
```

Chưa làm side-chain ducking ở MVP.

Video nguồn quyết định duration cuối.

---

## 10. Output MVP

```text
Container: MP4
Video: H.264
Audio: AAC
Pixel format: yuv420p
CRF: 20
Preset: medium
AAC: 192 kbps
```

Chưa mở:
- H.265
- AV1
- NVENC/QSV/AMF
- custom FFmpeg args

---

## 11. Temp output / finalize

Không render thẳng vào output cuối.

Ví dụ:

```text
video.airdvd-rendering.tmp.mp4
```

Sau success:
1. temp file tồn tại
2. size > 0
3. optional probe duration
4. rename/move sang output cuối
5. báo `COMPLETED`

Nếu lỗi/cancel:
- xóa temp best-effort
- không phá output cũ
- ghi log

---

## 12. State machine

```text
IDLE
CHECKING_ENVIRONMENT
READY
VALIDATING
PREPARING
RENDERING
FINALIZING
COMPLETED
CANCEL_REQUESTED
CANCELLED
ERROR
```

Không cho cùng `jobId` chạy 2 process.

---

## 13. Progress

Ưu tiên:

```text
-progress pipe:1
-nostats
```

Parse:
- out_time_ms / out_time_us
- frame
- fps
- speed
- progress

Tính:

```text
percent = rendered_time / source_duration
```

Tauri emit progress event có cấu trúc về frontend.

---

## 14. Cancel

Rust giữ registry process đang chạy.

`cancel_render(job_id)`:
1. tìm process
2. mark cancel requested
3. terminate FFmpeg
4. wait/reap
5. xóa temp output
6. trả `CANCELLED`

Không để orphan FFmpeg process.

---

## 15. Error codes

```text
FFMPEG_NOT_FOUND
FFMPEG_UNUSABLE
SOURCE_VIDEO_MISSING
SOURCE_VIDEO_NOT_NATIVE
DUBBED_AUDIO_MISSING
OUTPUT_PATH_INVALID
OUTPUT_EXISTS
SUBTITLE_DATA_INVALID
LOGO_PATH_INVALID
RENDER_ALREADY_RUNNING
FFMPEG_START_FAILED
FFMPEG_EXIT_FAILED
RENDER_CANCELLED
FINALIZE_FAILED
```

Frontend không parse message text để suy ra state.

---

## 16. UI Export MVP

Cần có:
- MP4 H.264
- output file path
- audio mode
- environment status
- progress bar
- status text
- Export
- Cancel
- Open output folder

Không có raw FFmpeg arguments input.

---

## 17. Quan hệ với Editor tương lai

Render MVP có thể render toàn bộ source video, nhưng kiến trúc phải mở được cho:
- trim
- split
- speed
- transform
- transitions
- effects
- undo/redo

Về lâu dài renderer nhận render plan từ project model, không đọc state rải rác trực tiếp từ UI.

---

# 18. PHASE PLAN

## R0 — Plan + baseline
**Status:** `CURRENT`

- giữ file kế hoạch này trong project local
- xác nhận Export hiện là placeholder
- xác nhận Tauri command registration
- xác nhận video/TTS native path
- khóa kiến trúc render

**Exit criteria:** file plan lưu trong repo local. Chưa cần push GitHub.

---

## R1 — FFmpeg Preflight
**Status:** `NOT STARTED`

Tạo:

```text
src/features/export/exportContracts.ts
src/features/export/exportService.ts
src/features/export/index.ts
src-tauri/src/render.rs
```

Rust:
- `mod render;`
- `check_render_environment`

R1 chưa thay đổi nút Export.

Test:
- `npm run build`
- Rust/Tauri compile
- READY nếu có FFmpeg
- NOT READY sạch nếu không có
- Payment/License không bị đụng

---

## R2 — MP4 video + audio
**Status:** `NOT STARTED`

Scope:
- source video
- A2
- reduce / keep / mute
- MP4 H.264/AAC
- chưa subtitle
- chưa logo

Cần:
- ExportRequest
- output picker
- start_render
- temp output
- FFmpeg process
- basic progress
- result/error

---

## R3 — Subtitle burn-in
**Status:** `NOT STARTED`

- ASS generator
- UTF-8 Vietnamese
- style/position mapping
- burn-in
- cleanup temp ASS

---

## R4 — Logo overlay
**Status:** `NOT STARTED`

- native logo path
- scale
- x/y
- PNG alpha
- JPEG
- optional logo

---

## R5 — Progress + Cancel
**Status:** `NOT STARTED`

- structured events
- job registry
- cancel command
- UI progress/cancel
- process cleanup

---

## R6 — Hardening
**Status:** `NOT STARTED`

- overwrite policy
- output validation
- open folder
- retry
- diagnostics
- clean state sau error/cancel

---

## R7 — Production packaging
**Status:** `NOT STARTED`

- pinned FFmpeg binary
- version/hash/provenance
- license review
- bundle runtime
- clean-machine test
- installed-app render test

---

## 19. Test matrix

### Environment
- FFmpeg có
- không có
- exe lỗi
- path có khoảng trắng
- path Unicode tiếng Việt

### Video
- MP4 H264/AAC
- MP4 không audio
- MKV source
- portrait
- landscape
- 1080p
- ngắn/dài

### Audio
- A2 có/thiếu
- A2 ngắn/dài hơn video
- reduce/keep/mute

### Subtitle
- none
- tiếng Việt dấu
- multiline
- câu dài
- ký tự đặc biệt
- subtitle đã edit

### Logo
- none
- PNG alpha
- JPEG
- resize/edge placement

### Error/Cancel
- cancel sớm
- cancel gần xong
- output path lỗi
- output tồn tại
- write failure
- FFmpeg exit non-zero

---

## 20. Security

1. Không nhận raw FFmpeg args từ user.
2. Build args từ typed fields.
3. Không shell-concatenate path.
4. Validate path.
5. Temp file trong vùng app kiểm soát.
6. Chặn path traversal qua job ID.
7. Giới hạn stderr log.
8. Không chạy arbitrary executable path từ frontend.
9. Production FFmpeg path phải do discovery logic kiểm soát.

---

## 21. File ownership dự kiến

```text
src/features/export/
  exportContracts.ts
  exportService.ts
  useExport.ts
  index.ts

src/components/editor/EditPanel.tsx
  UI export

src-tauri/src/render.rs
  FFmpeg environment/process/progress/cancel/finalize

src-tauri/src/lib.rs
  register command

runtime/ffmpeg/
  runtime dev/prod

docs/AI-RDVD-RENDER-EXPORT-PLAN.md
  tài liệu này
```

Không nhồi render logic trực tiếp vào `AIRDvD.tsx` hoặc `lib.rs`.

---

## 22. Progress log

### 2026-10-10 — Plan created

Đã xác nhận:
- baseline `bb2f27c`
- Export UI đang là placeholder
- `handleFinalExport()` chưa render
- output folder đang placeholder
- video có thể có `videoPath` native
- TTS có WAV output path native
- logo chưa có native path ổn định
- Payment/License là vùng bảo vệ, không đụng trong render

**Next action:** R1 — FFmpeg preflight.

---

## 23. Handoff khi đổi phiên

Khi mở phiên mới, đọc theo thứ tự:

1. `README.md`
2. `docs/AI-RDVD-RENDER-EXPORT-PLAN.md`
3. `git status -sb`
4. `git log -5 --oneline --decorate`
5. file liên quan phase hiện tại

Sau đó xem:
- Section 18 — phase hiện tại
- Section 22 — progress log mới nhất

Không nhảy phase chỉ vì UI đã có nút. Một phase chỉ hoàn thành khi implementation + test đạt exit criteria.


## 2026-10-10 — R1 implementation started

Đã tạo local foundation cho R1:

- `src/features/export/exportContracts.ts`
- `src/features/export/exportService.ts`
- `src/features/export/index.ts`
- `src-tauri/src/render.rs`
- đăng ký `mod render;`
- đăng ký Tauri command `render::check_render_environment`

Chưa nối Export UI và chưa render video thật.

**R1 next:** frontend build → Rust compile → kiểm tra FFmpeg thực tế trên máy → sau khi PASS mới đánh dấu R1 completed.


## 2026-10-10 — R1 PASS / R2.1 started

R1 đã PASS:

- `npm run build` PASS.
- `cargo check` PASS.
- FFmpeg 8.1.2 được tìm thấy trong PATH.
- FFmpeg build có `libx264` và `libass`.
- Tauri Desktop smoke test PASS; ứng dụng mở bình thường.

R2.1 bắt đầu:

- cố định contract `ExportRequestV1`;
- thêm schemaVersion = 1;
- giới hạn MVP format = MP4;
- video codec = H.264;
- audio codec = AAC;
- audio mode = reduce/keep/mute;
- thêm default CRF/preset/audio gain/bitrate;
- chưa nối Export UI;
- chưa gọi FFmpeg render thật.

**R2 next:** R2.2 chọn output file native + R2.3 Rust start_render MVP.


## 2026-10-10 — R2.2 / R2.3 implementation

Đã triển khai local:

### R2.2 — Native output picker

- thêm `chooseExportOutputPath()`;
- dùng Tauri dialog plugin;
- filter MP4;
- tự bổ sung đuôi `.mp4` nếu thiếu.

### R2.3 — Rust start_render MVP

- thêm Tauri command `start_render`;
- validate `ExportRequestV1`;
- resolve FFmpeg;
- MVP hiện chỉ cho audio mode `mute`;
- map video V1 + audio A2;
- H.264/libx264 + AAC;
- `apad + -shortest` để duration theo video nguồn;
- render ra temp output trước;
- chỉ rename sang output cuối sau khi FFmpeg PASS và temp > 0 byte;
- không overwrite output đã tồn tại;
- subtitle/logo vẫn bị chặn có chủ đích đến R3/R4;
- chưa nối Export UI với `startRender()`.

**Next test:** `npm run build` → `cargo check`.

**Sau PASS:** R2.4 nối UI tối thiểu để chọn output và render một MP4 thật ở mode mute.


## 2026-10-10 — R2.4 UI wiring

Đã nối local Export UI với render backend:

- tạo `src/features/export/useExport.ts`;
- preflight FFmpeg khi pipeline sẵn sàng;
- native save dialog cho MP4;
- Export panel hiển thị output path/status;
- Export button gọi `start_render`;
- R2.4 cố định mode `mute`: V1 + A2, bỏ A1;
- subtitle/logo vẫn disable có chủ đích;
- chưa có progress theo %/Cancel (R5).

**Test bắt buộc trước khi sang R2.5:**

1. `npm run build`
2. `cargo check`
3. `npm run tauri:dev`
4. dùng một video ngắn đã có A2 và pipelineDone
5. chọn tab Export
6. chọn output mới chưa tồn tại
7. Export
8. xác nhận MP4 được tạo, mở được, video đúng duration và có A2
9. xác nhận source video/WAV không bị thay đổi

Nếu real render PASS mới triển khai `keep`/`reduce`.


## 2026-10-10 — S1/A2 timing integrity fix before R3

- Fix OCR cue end: repeated/blank sampled frames now reach stabilizer.
- Blank debounce closes cue at last frame where subtitle was actually seen.
- Direct subtitle-to-subtitle transition remains contiguous.
- Translation no longer inflates valid source cue duration to 250 ms.
- A2 Timeline now visualizes actualStartMs/actualEndMs when available.
- S1 preview already respects segment.end and nextStart; no change required.

Test Recognition → Translation → TTS again before R3 subtitle burn-in.


## 2026-10-10 — R3 subtitle burn-in + live subtitle settings

- Burn S1 bằng ASS/libass.
- Export lấy state hiện tại từ Tùy chỉnh phụ đề: text, X/Y, box W/H, font size, text color, background color, transparency, outline, outline width, S1 visibility.
- Dùng cùng buildSubtitleDisplayCues với Preview để timecode/segment split nhất quán.
- A2 tiếp tục là audio output; A1 mute.
- Logo để R4.
- CSS gradient được xấp xỉ bằng ASS background box; font style UI hiện là fixed label nên R3 dùng Arial để đảm bảo glyph tiếng Việt.


## 2026-10-11 — R3.1 v2 uppercase/weight parity

Local compact render.rs patched successfully:

- Preview uses CSS text-transform uppercase.
- ASS render now uses Unicode uppercase only for display text.
- Underlying S1 text is unchanged.
- TTS input/audio is unchanged.
- Foreground ASS style uses Bold=-1 to better match Preview font-weight 900.

Test with a new output filename before continuing.


## 2026-10-11 — R3.2 v2 persistent subtitle mask

- Background mask is now drawn by FFmpeg for the whole video.
- X/Y/width/height come from the current Ctrl+Shift+S subtitle box.
- Background color and opacity come from the current subtitle settings.
- S1 text still follows exact cue timecodes.
- Old per-cue ASS background is disabled to avoid double-darkening.
- The source video's hard subtitle remains covered before, between, and after S1 cues.


## 2026-10-11 — R4 logo overlay

- Native Tauri logo picker keeps a real filesystem path.
- Existing Preview move/resize is preserved.
- Export sends logo path/x/y/width/height.
- Rust validates PNG/JPG/JPEG/WEBP/BMP.
- FFmpeg composites logo after subtitle mask/S1 and before encode.
- PNG transparency is preserved.
- Output: V1 + persistent subtitle mask + timed S1 + logo + A2.

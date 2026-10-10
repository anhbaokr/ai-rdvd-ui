# AI RDvD — Render / Export Implementation Plan

**Purpose:** Durable implementation plan for adding real final-video rendering/export to AI RDvD Desktop.  
**Repository:** `anhbaokr/ai-rdvd-ui`  
**Starting baseline:** `bb2f27c8aa6113a56290795db5f4370fd06641db`  
**Baseline tag:** `checkpoint/application-baseline-2026-10-10`  
**Current application version:** `0.1.5`  
**Plan created:** 2026-10-10  
**Rule:** This file is the source of truth for the render/export work. Update the status section whenever a phase is completed, changed, blocked, or deliberately deferred.

---

## 1. Why this project exists

AI RDvD currently completes the AI preparation workflow but does not yet produce a real finished video file.

The currently usable path is:

```text
Source video
→ Chinese subtitle OCR
→ timed subtitle timeline
→ Chinese → Vietnamese translation
→ review/approval
→ VieNeu Vietnamese TTS
→ aligned dubbed WAV
→ Preview + Timeline
```

The missing final step is:

```text
Project state
+ source video
+ audio policy
+ Vietnamese subtitle
+ logo/overlay state
+ future edit operations
→ real encoded output file
```

The existing Export panel is only a UI placeholder. `handleFinalExport()` currently sets a queued flag and writes a log message; it does not invoke an encoder.

---

## 2. Non-negotiable safety rules

Render/export development must not destabilize the payment/license baseline.

### 2.1 Do not break

1. Do not change Payment Gateway contracts as part of render work.
2. Do not change license activation/renewal logic as part of render work.
3. Do not modify machine-ID behavior.
4. Do not weaken updater signature verification.
5. Do not put secrets into render logs or export metadata.
6. Keep OCR → translation → TTS segment IDs/timecodes intact.
7. A render failure must never mutate payment/license state.
8. A render failure must never destroy the source video or TTS output.
9. Render to a temporary output first, then finalize only after success.
10. One logical patch → build/test → PASS/FAIL recorded → then continue.

### 2.2 Source-of-truth rule

The renderer consumes project/media state; it does not become a new authority for licensing, payment, translation acceptance, or TTS entitlement.

---

## 3. Definition of “render complete”

The first production-usable render milestone is achieved only when the Desktop can:

1. accept a source video with a real native file path,
2. accept generated A2 dubbed audio,
3. apply the selected source-audio policy,
4. render Vietnamese subtitles into the final video,
5. include the user-selected logo when present,
6. encode an MP4/H.264 + AAC output,
7. show deterministic progress,
8. support cancellation,
9. report actionable errors,
10. never overwrite a valid output with a partial failed render,
11. open the output folder after completion,
12. preserve synchronization between source video, S1 subtitle and A2 audio.

MKV and advanced editor effects are not required for the first render-complete milestone.

---

## 4. Architecture decision

### 4.1 Renderer

Use FFmpeg as the media renderer/encoder, orchestrated by the Tauri/Rust layer.

Why:

- proven video/audio filter graph support,
- H.264/AAC output,
- subtitle/ASS rendering,
- logo overlay,
- audio mixing/volume filters,
- deterministic command-line behavior,
- progress output suitable for parsing,
- cancellation through child-process control.

### 4.2 Responsibility split

```text
React / TypeScript
  ├─ export settings UI
  ├─ request validation visible to user
  ├─ progress/cancel UI
  ├─ build canonical ExportRequest
  └─ display result/error

Tauri / Rust
  ├─ FFmpeg discovery
  ├─ native path validation
  ├─ temporary render workspace
  ├─ generated ASS file
  ├─ FFmpeg command construction
  ├─ safe process spawning
  ├─ progress parsing/events
  ├─ cancellation
  ├─ technical logging
  └─ atomic finalization of output

FFmpeg
  ├─ video encode
  ├─ audio mapping/mixing
  ├─ subtitle burn-in
  ├─ logo overlay
  └─ final mux
```

### 4.3 Why not implement rendering in React

The frontend should not own native encoder paths, process execution, filesystem temp files, or cancellation handles. Those belong in Rust.

### 4.4 Why not add a Python render worker first

The project already uses Python for AI inference, but render/export does not require Python. A Rust → FFmpeg path is simpler, removes another runtime dependency from export, and gives tighter process control.

A Python render worker may be reconsidered only if future render logic becomes materially easier to maintain there.

---

## 5. FFmpeg runtime strategy

### 5.1 Development discovery order

The preflight command should search in this order:

1. packaged/bundled FFmpeg resource,
2. app-local FFmpeg runtime,
3. project development runtime path,
4. system `PATH` as a development fallback.

Expected development candidate:

```text
runtime/ffmpeg/ffmpeg.exe
```

### 5.2 Production rule

Production builds must not depend on a random system FFmpeg installation.

Before production release, choose and package a pinned Windows FFmpeg build and record:

- exact build/version,
- SHA-256,
- source URL/build provenance,
- applicable FFmpeg license configuration,
- redistribution notices.

### 5.3 Legal/licensing checkpoint

FFmpeg redistribution terms depend on the exact build configuration and linked codecs. Before bundling a production binary, verify the chosen build’s license obligations and keep required notices/source-offer information as applicable.

This legal/package review is a release requirement, not a reason to block local development using a known FFmpeg executable.

---

## 6. Canonical export data model

The render system must use a typed request rather than reading arbitrary UI state from many components.

Proposed TypeScript/Rust-compatible shape:

```ts
interface ExportRequest {
  jobId: string;
  sourceVideoPath: string;
  dubbedAudioPath: string | null;
  outputPath: string;
  format: 'mp4';

  video: {
    width: number | null;
    height: number | null;
    fps: number | null;
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
    style: {
      stageWidth: number;
      stageHeight: number;
      x: number;
      y: number;
      width: number;
      height: number;
      fontSize: number;
      textColor: string;
      backgroundColor: string;
      backgroundOpacity: number;
      outline: boolean;
      outlineWidth: number;
    };
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

The exact contract may evolve before R2, but once R2 starts it must be versioned deliberately rather than changed ad hoc.

---

## 7. Native-path requirements

Real rendering cannot rely on browser-only Blob/Object URLs.

### 7.1 Source video

`sourceVideoPath` must be a real native path.

Current Desktop already prefers the native Tauri media picker and stores `videoPath`. Browser fallback can preview a file but cannot be considered render-ready unless the file is materialized to a native temporary path.

MVP policy:

```text
videoPath exists → render allowed
videoPath missing → Export UI explains that the source must be re-selected through the native picker
```

Do not silently guess the browser file path.

### 7.2 TTS audio

VieNeu TTS already returns a real `outputPath`; this can be passed directly to the renderer after validation.

### 7.3 Logo image

Current logo state is browser `File + object URL`; it does not preserve a canonical native path.

Before logo export is enabled, do one of:

A. change logo import to use a native Tauri picker and store the selected path, or
B. safely materialize the selected image into an app-local render asset and retain that native path.

Preferred: **A** for Desktop.

Preview behavior can still use a converted local file URL.

---

## 8. Subtitle render strategy

Use an intermediate ASS subtitle file generated by Rust from the canonical subtitle request.

Why ASS:

- millisecond-level timeline representation is sufficient for this workflow,
- UTF-8 Vietnamese text,
- configurable font size/color/outline,
- explicit placement,
- FFmpeg/libass integration.

### 8.1 ASS generation rules

- Script resolution maps to the project stage resolution (currently 1920×1080 logical stage).
- Convert segment start/end milliseconds to ASS timestamps.
- Escape ASS control characters/newlines safely.
- Preserve edited Vietnamese segment text.
- Generate a deterministic style from current subtitle UI settings.
- Position subtitle text relative to the current subtitle box.

### 8.2 Preview parity

The browser subtitle preview and FFmpeg/ASS output will not be pixel-identical automatically.

Acceptance target for MVP:

- same content,
- same timing,
- same approximate position,
- same primary color,
- same outline behavior,
- visually equivalent readable result.

Pixel-perfect parity can be a later tuning phase.

---

## 9. Audio policy

The UI already has:

```text
reduce
keep
mute
```

The renderer must give those states real semantics.

### 9.1 `mute`

Final audio uses A2 dubbed audio only.

If no A2 exists, export must fail validation instead of generating a silent unexpected video.

### 9.2 `keep`

Mix A1 original audio and A2 dubbed audio without ducking.

Initial target gains:

```text
A1 = 1.0
A2 = 1.0
```

Expose gain tuning later if needed.

### 9.3 `reduce`

Mix A1 beneath A2 at a reduced level.

Initial deterministic MVP target:

```text
A1 = 0.20–0.30
A2 = 1.0
```

Do not implement dynamic side-chain ducking in the first patch. Static gain reduction is easier to validate. True side-chain ducking can be a later enhancement.

### 9.4 Duration behavior

The source video timeline is authoritative for final duration.

- If A2 is shorter, silence continues after A2.
- If A2 is slightly longer due to tail padding, trim output to source-video duration.
- Subtitle segments beyond source duration must be clipped/rejected during validation.

---

## 10. Output format scope

### MVP

```text
Container: MP4
Video: H.264
Audio: AAC
Pixel format: yuv420p
```

Initial quality defaults:

```text
CRF: 20
Preset: medium
AAC: 192 kbps
```

These are implementation defaults, not permanent UI promises.

### Deferred

- MKV
- HEVC/H.265
- AV1
- hardware encoders (NVENC/QSV/AMF)
- custom resolution presets
- custom FPS conversion
- bitrate mode UI

Do not expose options before the backend actually supports and validates them.

---

## 11. Safe output/finalization policy

Never render directly into the user’s final filename.

Use:

```text
<output>.airdvd-rendering.tmp.mp4
```

or a job-specific temp file in an app render workspace.

On successful FFmpeg exit and validation:

1. verify temporary output exists,
2. verify non-zero file size,
3. optionally probe duration,
4. move/rename to requested final path,
5. only then report `COMPLETED`.

On failure/cancel:

- delete temporary output best-effort,
- leave existing final file untouched unless the user explicitly approved overwrite before rendering,
- persist diagnostic log.

---

## 12. Render job state machine

Proposed UI/native states:

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

Terminal states:

```text
COMPLETED
CANCELLED
ERROR
```

The same job ID must not have two concurrent FFmpeg processes.

---

## 13. Progress protocol

Use FFmpeg progress mode rather than parsing human-formatted status lines where possible:

```text
-progress pipe:1
-nostats
```

Parse fields such as:

- `out_time_ms` / `out_time_us` depending on FFmpeg build,
- `frame`,
- `fps`,
- `speed`,
- `progress=continue|end`.

Compute:

```text
percent = rendered_time / source_duration
```

Clamp to `0..100`.

Tauri emits structured progress events to the frontend, e.g.:

```ts
{
  jobId,
  phase: 'RENDERING',
  percent,
  outTimeMs,
  frame,
  fps,
  speed,
  message
}
```

---

## 14. Cancellation strategy

Rust owns active child processes in a synchronized job registry.

`cancel_render(job_id)` should:

1. find the active child/job,
2. mark cancellation requested,
3. terminate FFmpeg,
4. wait/reap child,
5. delete temporary render file best-effort,
6. emit/return CANCELLED.

Do not leave orphaned FFmpeg processes.

The exact process-registry implementation must be tested on Windows before being considered complete.

---

## 15. Technical logging requirements

Render logs must include safe diagnostics:

```text
RENDER CHECK — READY / NOT READY
RENDER START — job=<id>
Input video path
Input audio path (when used)
Output path
Mode: reduce/keep/mute
Subtitle count
Logo enabled yes/no
FFmpeg version/path
Render phase
Exit code
Elapsed time
Final output bytes
```

Do not log:

- payment access tokens,
- license tokens,
- secret keys.

FFmpeg stderr should be capped/truncated in the persistent log to avoid unbounded growth.

---

## 16. Error taxonomy

Frontend should receive stable error codes plus user-readable messages.

Initial codes:

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

Do not make the frontend parse arbitrary Vietnamese error strings to determine application state.

---

## 17. UI changes

The existing Export tab should evolve incrementally.

### MVP fields

- format: MP4 (H.264), fixed initially,
- output file path,
- source-audio policy (`reduce`, `keep`, `mute`) or reuse existing workflow state,
- environment status,
- render progress bar,
- render status text,
- Export button,
- Cancel button while rendering,
- Open output folder after success.

### Not in MVP UI

- advanced codec matrix,
- hardware encoder selection,
- effects/transitions,
- custom filter strings,
- arbitrary FFmpeg arguments.

Never expose a raw FFmpeg-arguments input field.

---

## 18. Interaction with future editor work

Render must be designed so future real editing can feed it a project model.

Do not hard-code the renderer permanently to “one full source video from 0 to duration”.

However, MVP may support only that simple source structure while the request contract is designed for extension.

Future additions:

- clip list,
- trim ranges,
- split clips,
- speed changes,
- transforms,
- transitions,
- effects,
- undo/redo-driven project state.

The render engine should eventually consume a render plan generated from the project model rather than directly reading component state.

---

## 19. Phase plan

### R0 — Durable plan and audit baseline

Status: `IN PROGRESS`

Deliverables:

- this plan file,
- confirm current fake-export path,
- confirm Tauri command registration location,
- confirm native video path availability,
- define initial architecture and invariants.

Exit criteria:

- plan committed to repository,
- local and GitHub main synchronized.

---

### R1 — Render foundation / FFmpeg preflight

Status: `NOT STARTED`

Goal: add no-risk infrastructure without yet rendering video.

Deliverables:

1. `src/features/export/exportContracts.ts`
2. `src/features/export/exportService.ts`
3. `src/features/export/index.ts`
4. `src-tauri/src/render.rs`
5. `mod render;` in Rust
6. register `render::check_render_environment`
7. environment result structure
8. FFmpeg discovery/version check
9. technical log entry for render preflight

No existing Export button behavior changes in R1.

Tests:

- `npm run build`
- `cargo check` or Tauri dev compile
- preflight returns READY when FFmpeg is available
- returns NOT READY cleanly when unavailable
- payment/license smoke path unaffected

Checkpoint after PASS:

```text
checkpoint/render-r1-preflight-2026-10-10
```

---

### R2 — MVP MP4 render: video + audio only

Status: `NOT STARTED`

Goal: produce a real MP4 before introducing subtitle/logo complexity.

Scope:

- source video,
- A2 dubbed audio,
- audio policy reduce/keep/mute,
- H.264/AAC MP4,
- no subtitle burn-in yet,
- no logo yet.

Deliverables:

- typed ExportRequest v1,
- output save path,
- `start_render`,
- safe temp output,
- FFmpeg process execution,
- structured result,
- basic progress,
- Export button connected to real render.

Tests:

- short sample video,
- mute mode,
- keep mode,
- reduce mode,
- source without audio,
- missing A2,
- cancel/error leaves source untouched,
- output plays and duration matches source.

Checkpoint after PASS:

```text
checkpoint/render-r2-mp4-audio
```

---

### R3 — Vietnamese subtitle burn-in

Status: `NOT STARTED`

Deliverables:

- ASS generator,
- UTF-8 Vietnamese escaping,
- S1 segment validation,
- current global subtitle style mapping,
- position mapping from 1920×1080 logical stage,
- burn-in filter graph,
- temporary ASS cleanup.

Tests:

- diacritics,
- multiline text,
- edited subtitle content,
- first/last cues,
- overlapping cues validation,
- outline/color/position sanity.

Checkpoint:

```text
checkpoint/render-r3-subtitles
```

---

### R4 — Logo overlay

Status: `NOT STARTED`

Deliverables:

- native logo path workflow,
- source image validation,
- overlay scale/position mapping,
- alpha-preserving PNG support,
- logo absent path remains valid.

Tests:

- PNG alpha,
- JPEG,
- corners/center,
- resize,
- no-logo export.

Checkpoint:

```text
checkpoint/render-r4-logo
```

---

### R5 — Production progress + cancellation

Status: `NOT STARTED`

Deliverables:

- full progress event protocol,
- active render job registry,
- cancel command,
- UI progress/cancel states,
- no orphan FFmpeg process,
- temp cleanup.

Checkpoint:

```text
checkpoint/render-r5-progress-cancel
```

---

### R6 — Output UX / diagnostics hardening

Status: `NOT STARTED`

Deliverables:

- overwrite confirmation policy,
- open output folder,
- actionable errors,
- duration/output validation,
- render log improvements,
- retry behavior,
- clean state after error/cancel.

Checkpoint:

```text
checkpoint/render-r6-hardening
```

---

### R7 — Production packaging

Status: `NOT STARTED`

Deliverables:

- pinned FFmpeg binary/package decision,
- packaged runtime path,
- hash/provenance record,
- license/notice review,
- clean-machine installer test,
- updater test from previous release,
- render test on installed application.

Exit criterion:

A user on a clean supported Windows machine can install AI RDvD and render an MP4 without manually installing FFmpeg/Python beyond what the installer/setup flow intentionally provisions.

---

## 20. Test matrix

### Environment

- FFmpeg bundled/found.
- FFmpeg absent.
- FFmpeg executable invalid.
- path containing spaces.
- path containing Vietnamese Unicode.

### Source media

- MP4 H.264/AAC.
- MP4 without audio.
- MKV source.
- portrait video.
- 1080p landscape.
- short duration.
- longer duration.

### TTS/audio

- A2 present.
- A2 missing.
- A2 shorter than video.
- A2 tail longer than video.
- reduce/keep/mute.

### Subtitle

- none.
- normal Vietnamese.
- long line.
- multiline.
- quotes/braces/backslashes.
- edited text.

### Logo

- none.
- PNG alpha.
- JPEG.
- large image.
- edge placement.

### Failure/cancel

- cancel at 5%.
- cancel near completion.
- invalid output path.
- output already exists.
- disk/write failure.
- FFmpeg non-zero exit.

---

## 21. Performance policy

MVP prioritizes correctness and deterministic CPU compatibility over maximum speed.

Do not start with hardware encoder branching.

After software H.264 is stable, benchmark:

- `libx264 preset=medium`
- faster presets for low-end PCs
- optional future NVENC/QSV/AMF detection

Hardware acceleration must be an optional optimization, never a requirement for successful export.

---

## 22. Security considerations

1. Never execute raw user-provided FFmpeg argument strings.
2. Build FFmpeg arguments from typed validated fields.
3. Pass paths as process arguments, not shell-concatenated commands.
4. Validate source/output paths.
5. Keep render temp files inside controlled workspace or beside approved output with safe naming.
6. Prevent job ID path traversal.
7. Cap diagnostic output retained in logs.
8. Do not follow arbitrary executable paths supplied by frontend without validation.
9. Production FFmpeg executable path comes from controlled discovery logic.

---

## 23. Planned file ownership

```text
src/features/export/
  exportContracts.ts
  exportService.ts
  useExport.ts               (R2/R5)
  index.ts

src/components/editor/EditPanel.tsx
  Export UI only; receives export controller state/actions

src-tauri/src/render.rs
  environment, validation, FFmpeg command, jobs, progress, cancellation

src-tauri/src/lib.rs
  command registration only

runtime/ffmpeg/
  development/production runtime location after packaging decision

docs/AI-RDVD-RENDER-EXPORT-PLAN.md
  this durable plan/status log
```

Avoid putting the render implementation directly into the already-large `AIRDvD.tsx` or `lib.rs`.

---

## 24. Progress log

Update this section every time a render phase is completed.

### 2026-10-10 — Plan created

Baseline facts confirmed:

- application baseline commit: `bb2f27c`,
- Export UI exists but has no real encoder,
- `usePipeline.handleFinalExport()` only queues/logs,
- EditPanel output folder is currently a hard-coded placeholder,
- Tauri already has the dialog plugin,
- Tauri command registration lives in `src-tauri/src/lib.rs`,
- source video can have a real native `videoPath`,
- TTS generation returns a real native WAV output path,
- logo currently does not preserve a native path suitable for FFmpeg,
- payment/license baseline is stable and must remain isolated.

**Next action:** implement R1 Render Foundation / FFmpeg preflight only, build/test it, then checkpoint before starting real MP4 encoding.

---

## 25. Session handoff checklist

If work continues in a new ChatGPT/development session, start by reading:

1. `README.md`
2. `docs/AI-RDVD-RENDER-EXPORT-PLAN.md`
3. current `git status -sb`
4. current `git log -5 --oneline --decorate`
5. relevant files for the current R-phase

Then identify the current phase from **Section 19** and the last entry in **Section 24**.

Do not skip ahead because a UI control already exists. A phase is complete only when its implementation and tests satisfy the stated exit criteria.

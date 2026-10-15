# AI RDvD Desktop — Technical, Functional & Business Baseline

**Application:** AI RDvD  
**Repository:** `anhbaokr/ai-rdvd-ui`  
**Current app version:** `0.1.5`  
**Pre-SECURITY-10D audited baseline:** `213aa37` â€” `security: harden offline entitlement and access flow`
**Pre-SECURITY-10D checkpoint:** `checkpoint/security-offline-entitlement-2026-10-14`
**Documentation scope:** full Desktop application workflow, runtime architecture, business rules, completed / partial / missing functionality, security invariants, technical debt, and recommended next changes.

> This document replaces the old short V47 README as the main operational baseline for future AI RDvD Desktop development. Historical V45–V47 notes remain under `docs/history/readme/` for reference.

---

## 1. Product purpose

AI RDvD is a Windows desktop application for a local-first AI video workflow:

1. Import a source video.
2. Recognize embedded Chinese subtitles from the video.
3. Convert recognition output into a timed subtitle/dialogue timeline.
4. Translate Chinese dialogue to Vietnamese with a local Hachimi-based translation pipeline.
5. Review or approve translation quality when required.
6. Generate Vietnamese dubbed audio with VieNeu TTS.
7. Align dubbed audio to subtitle timecodes.
8. Preview source video, subtitle overlay, logo overlay and dubbed audio.
9. Inspect the project on a multi-track timeline.
10. Eventually edit and export the finished video.

The application also contains a paid license system, renewal flow, payment integration, updater, technical logging and signed donation information.

---

## 2. Status legend

| Status | Meaning |
| --- | --- |
| `DONE` | Implemented and currently usable. |
| `DONE + E2E PASS` | Implemented and verified through an end-to-end real workflow. |
| `PARTIAL` | Implemented only for part of the intended behavior or still has important limitations. |
| `UI ONLY` | UI/state exists but the underlying media/business engine is not implemented. |
| `NOT IMPLEMENTED` | Intentionally blocked, placeholder, or absent. |
| `DO NOT BREAK` | Existing behavior is considered a compatibility/security invariant. |

---

## 3. High-level implementation status

| Area | Current status | Notes |
| --- | --- | --- |
| Windows Tauri desktop shell | `DONE` | Custom undecorated desktop window, React/Vite frontend, Rust backend. |
| Vietnamese / English UI | `DONE` | UI language switch and persisted preference. |
| Dark / light theme | `DONE` | Persisted preference. |
| App settings | `DONE` | Main settings are persisted in browser local storage. |
| License gate | `DONE + E2E PASS` | App locks workflow until license is valid. |
| Payment order creation | `DONE + E2E PASS` | Backend-controlled catalog and pricing. |
| QR payment display | `DONE + E2E PASS` | VietQR generated from backend order snapshot. |
| Payment status polling | `DONE + E2E PASS` | Immediate poll + 3-second interval, race-safe for PAID-before-license-token. |
| Device activation | `DONE + E2E PASS` | Machine-bound activation after payment. |
| License renewal | `DONE + E2E PASS` | Existing active license can be renewed through separate modal. |
| Offline grace | `DONE` | 72-hour local grace after successful online verification. |
| Video import | `DONE` | Native Tauri file picker preferred; browser file fallback exists. |
| Video preview | `DONE` | Playback, seek, mute, volume, fullscreen. |
| Video thumbnails | `DONE` | Generated for timeline preview. |
| Audio waveform | `PARTIAL` | Immediate visual waveform + WebAudio attempt; not a dedicated native waveform extractor. |
| Chinese subtitle OCR | `DONE` | PaddleOCR, Chinese-first baseline. |
| Chinese voice ASR | `NOT IMPLEMENTED` | Voice recognition mode is intentionally disabled. |
| Korean OCR | `NOT IMPLEMENTED` | Korean recognition currently blocked. |
| Chinese → Vietnamese translation | `DONE` | Local Hachimi pipeline with terminology/meaning guards. |
| Korean → Vietnamese translation | `NOT IMPLEMENTED` | Explicit `WAITING_MODEL` path. |
| Translation review | `DONE` | PASS / REVIEW / FAIL model, user approval for REVIEW without FAIL. |
| Translation checkpoint/resume | `DONE` | Worker persists progress by source digest + worker version. |
| VieNeu Vietnamese TTS | `DONE` | Real local TTS, 23 preset voices. |
| Voice preview MP3 | `DONE` | Separate from project TTS generation. |
| Time-aligned TTS | `DONE` | Per-cue generation aligned to subtitle timing. |
| Subtitle preview overlay | `DONE` | Position, size, colors, opacity, outline and text editing. |
| Logo overlay | `DONE` | Import, move, resize and remove. |
| Timeline V1/A1/S1/A2 | `DONE` for visualization | Playback/scrub/visibility/mute/solo/lock/sync UI exists. |
| Real cut/split/trim | `UI ONLY` | Buttons currently do not modify a real media project graph. |
| Effects | `UI ONLY` | Fade/Dissolve/Sharpen buttons are placeholders. |
| Final render/export | `NOT IMPLEMENTED` | Export UI exists but no actual render/encode engine yet. |
| Technical log | `DONE` | Visible recent log + persistent AppData technical log. |
| Auto updater | `DONE` | Tauri updater with signed updater artifacts. |
| About / donation | `DONE` | Donation manifest is integrity-checked with Ed25519. |
| Production release provenance gate | `PARTIAL` | Release script builds/releases but does not commit/push or enforce clean/synced source first. |

---

## 4. System architecture

```text
AI RDvD Desktop
│
├── React + TypeScript + Vite
│   ├── AIRDvD.tsx                  Main orchestration/state
│   ├── WorkflowSidebar             Step-based workflow UI
│   ├── VideoPreview                Preview, subtitles, logo
│   ├── Timeline                    V1/A1/S1/A2 visualization
│   ├── EditPanel                   Current edit/export placeholder layer
│   ├── Settings / Topbar / About
│   ├── features/payment
│   ├── features/license
│   └── features/appUpdate
│
├── Tauri 2 / Rust
│   ├── lib.rs                      Command registration / runtime bridge
│   ├── recognition.rs              Python OCR worker integration
│   ├── payment_gateway.rs          Restricted HTTPS backend bridge
│   ├── payment.rs                  QR/payment native helpers
│   ├── license.rs                  Machine ID + local license state
│   └── donation.rs                 Signed donation manifest verification
│
├── Python workers
│   ├── backend/subtitle_ocr        PaddleOCR subtitle recognition
│   ├── backend/translation_worker.py
│   └── backend/tts_worker.py
│
├── Translation Core
│   ├── Hachimi local translator
│   ├── dictionary resolver
│   ├── contextual disambiguation
│   ├── terminology registry/planner
│   ├── meaning frame
│   ├── meaning guard
│   ├── semantic evidence
│   └── learning memory
│
└── Distribution
    ├── NSIS / MSI
    ├── signed updater artifacts
    ├── latest.json
    └── GitHub Releases
```

### 4.1 Main technology stack

- React + TypeScript.
- Vite.
- Tauri 2.
- Rust native commands.
- Python local AI workers.
- PaddleOCR for Chinese subtitle OCR.
- CTranslate2/HachimiMT for Chinese → Vietnamese translation.
- VieNeu v3 Turbo for Vietnamese speech generation.
- Tauri updater for application updates.

### 4.2 Current desktop packaging

- Product name: `AI RDvD`.
- Identifier: `com.airdvd.app`.
- Window default: 1440 × 900.
- Minimum window: 1040 × 640.
- Custom undecorated window controls.
- Bundle targets: NSIS and MSI.
- Tauri updater artifacts enabled.

---

## 5. Desktop startup and license gate

### Status: `DONE`

The application does not expose the main workflow until license validation succeeds.

### 5.1 Startup sequence

```text
App starts
  ↓
Read local license-state.json
  ↓
Token exists?
  ├── No  → NO_LICENSE
  └── Yes
       ↓
Read machine identity
       ↓
Check local machine binding
       ↓
Online checkLicense
       ↓
License ACTIVE?
       ├── No → EXPIRED / INVALID / MACHINE_MISMATCH / DEVICE_LIMIT
       └── Yes
            ↓
activateDevice
            ↓
Persist verified local snapshot + offline grace
            ↓
ACTIVE
```

### 5.2 Machine identity

On Windows, Rust reads `MachineGuid` from the Windows registry and hashes a canonical value using SHA-256. The app exposes an internal machine ID with the `machine_id_v1_` scheme.

`DO NOT BREAK`:

- Do not silently change the machine ID algorithm in a normal update.
- A future machine ID scheme change must be versioned and migrated deliberately.
- Backend activation logic must remain compatible with existing purchased licenses.

### 5.3 Offline grace

Current policy:

```text
OFFLINE_GRACE_HOURS = 72
```

After a successful online verification, the Desktop stores:

- license token,
- machine ID,
- last verification time,
- offline grace deadline,
- license snapshot.

If the server becomes unreachable, the app may remain ACTIVE only when:

1. local state schema is supported,
2. machine ID matches,
3. current time is before `offlineGraceUntilMs`,
4. license expiry has not passed,
5. stored license status is `ACTIVE`.

### 5.4 Security limitation that must be improved

Current local state is stored as a readable JSON file in the app local data directory. It validates structure, token format and machine match, but it is not currently protected by a server signature or Windows secure storage.

Recommended hardening:

1. Server-signed offline entitlement payload.
2. Verify signature in Rust with a pinned public key.
3. Encrypt/protect token using Windows DPAPI or Credential Manager.
4. Treat local timestamps as hints, not absolute authority.
5. Keep server-side license expiry and device status authoritative whenever online.

Priority: `HIGH`, but this must be implemented without breaking the current working payment/license flow.

---

## 6. Payment activation workflow

### Status: `DONE + E2E PASS`

The Desktop does not decide price, duration, payment account or device limit. Those values are returned by the backend catalog/order APIs.

### 6.1 Catalog and package selection

Desktop loads in parallel:

- machine identity,
- payment catalog.

A catalog item can be:

- fixed pricing,
- flexible number of days.

For flexible-day packages, the Desktop only validates the backend-provided min/max bounds and sends the requested number of days. The backend remains the pricing authority.

### 6.2 Order creation

```text
User selects package
  ↓
createOrder(machine_id, package, optional duration_days)
  ↓
Backend returns order snapshot
  ↓
Desktop retains order_access_token in memory
  ↓
Generate VietQR from returned payment snapshot
  ↓
Open payment modal
```

Important order data:

- `order_id`
- `machine_id`
- package and package name
- amount / currency
- duration days
- device limit
- payment code
- status
- created/expires timestamps
- payment account snapshot
- localized transfer-note template
- `order_access_token`

### 6.3 Payment polling

Desktop polling behavior:

- checks immediately after modal opens,
- polls every 3 seconds,
- updates countdown every second,
- performs a final status refresh when countdown reaches zero.

Protected `checkOrder` requests require `order_access_token`.

### 6.4 PAID-before-license-token race handling

This race has already been fixed and verified.

Backend may expose:

```text
Order.status = PAID
```

briefly before the License row/token is ready.

Desktop behavior must remain:

```text
PAID + no license_token
  ↓
Stay WAITING
  ↓
Keep polling checkOrder
  ↓
license_token appears
  ↓
Start activation
```

`DO NOT BREAK`: Do not convert temporary `PAID + no license_token` into terminal ERROR.

### 6.5 Activation after payment

```text
PAID + license_token
  ↓
checkLicense(token, machine_id)
  ↓
Require ACTIVE license
  ↓
activateDevice(token, machine_id, device_id)
  ↓
Persist license token locally
  ↓
SUCCESS
  ↓
Refresh global license gate
  ↓
Main application becomes ACTIVE
```

### 6.6 Cancel order

Cancellation requires:

- order ID,
- order access token,
- machine ID.

A cancelled order becomes terminal for the current payment modal.

### 6.7 Payment Gateway native bridge

Rust only permits HTTPS requests to the allowed Google Apps Script host and rejects oversized request bodies above 64 KB. The HTTP client follows a limited number of redirects and has connect/request timeouts.

This is intentional defense-in-depth and should be preserved.

### 6.8 External payment infrastructure

The full payment E2E flow includes components outside this repository:

```text
Desktop order/QR
  ↓
User bank transfer
  ↓
Android bank-notification gateway
  ↓
Resolve payment code → order
  ↓
Queue / receivePayment
  ↓
Apps Script backend
  ↓
Payments sheet
  ↓
Order = PAID
  ↓
License created
  ↓
Desktop polling receives license token
```

The Android payment gateway + backend path was verified with a real controlled transfer on 2026-10-10. The Desktop repository must not duplicate backend authority or manually fabricate payment/license state.

---

## 7. License renewal workflow

### Status: `DONE + E2E PASS`

When a license is already ACTIVE, the sidebar displays license information and exposes:

```text
KÍCH HOẠT / GIA HẠN BẢN QUYỀN
```

The renewal modal reuses the payment flow without destroying the current active license state first.

Expected behavior:

1. Current app remains usable under the existing active license.
2. Renewal modal creates a new payment order.
3. New order follows the same protected payment flow.
4. New license state is activated and saved.
5. Global license state refreshes.
6. Modal closes after successful activation.

`DO NOT BREAK`: Renewal must not clear the currently active license just because a new payment order is still WAITING or gets cancelled.

---

## 8. Video import and project reset

### Status: `DONE`

Preferred flow uses the Tauri native file picker so the app receives a real native video path for recognition.

Supported picker extensions currently include common formats such as:

- mp4
- mkv
- avi
- mov
- webm
- m4v
- ts

Browser file input remains a fallback for preview-only selection when native path selection fails.

Loading a new video resets current project-derived state:

- pipeline completion,
- auto stage,
- export queue,
- playing state,
- subtitle segments,
- translated file,
- dialogue file,
- translation accepted state,
- current time,
- duration,
- subtitle visibility/frame state.

This reset is important to prevent stale results from a previous video entering a new project.

---

## 9. Recognition / OCR

### 9.1 Chinese embedded subtitle OCR

Status: `DONE`

Current worker:

- uses PaddleOCR,
- uses Chinese OCR profile,
- scans every third video frame,
- processes the lower 50% of each frame,
- normalizes recognized text,
- separates Chinese/English content,
- keeps Chinese as the recognition target,
- stabilizes repeated subtitle observations,
- writes a timed subtitle timeline,
- returns SRT/timeline data back to the Desktop.

Recognition output is converted into:

- `subtitleSegments` for S1/timeline/preview,
- an in-memory `.ocr.srt` dialogue file for translation.

### 9.2 Voice ASR

Status: `NOT IMPLEMENTED`

The UI exposes a conceptual voice-recognition mode, but it is intentionally disabled. The OCR worker explicitly reports that dialogue ASR is not integrated in the current baseline.

Required future work:

1. Choose ASR engine.
2. Add local runtime/model packaging.
3. Return timestamped segments using the existing recognition contract.
4. Merge ASR and OCR results when `both` mode is selected.
5. Define conflict rules when spoken dialogue and on-screen subtitles differ.

### 9.3 Korean recognition

Status: `NOT IMPLEMENTED`

Korean source language appears in the UI, but OCR worker and auto pipeline intentionally stop for Korean.

Required future work:

- Korean OCR profile/worker or multilingual OCR pipeline.
- Korean subtitle segmentation rules.
- Korean recognition tests.
- Compatibility with the future KO→VI translation engine.

---

## 10. Chinese → Vietnamese translation

### Status: `DONE`

The application currently has a real local Chinese → Vietnamese translation pipeline, not a simple one-shot model call.

### 10.1 Translation environment

Desktop can:

- health-check the translation environment,
- locate translation Python/runtime,
- locate worker and assets,
- install/setup translation environment when missing,
- open translation output folder.

### 10.2 Translation flow

```text
Timed Chinese dialogue segments
  ↓
Parse and normalize segments
  ↓
Create deterministic job ID
  ↓
Load dictionaries / domain resources
  ↓
Generate Hachimi N-best candidates
  ↓
Context + terminology analysis
  ↓
Meaning/semantic guards
  ↓
Candidate reranking
  ↓
PASS / REVIEW / FAIL per segment
  ↓
Save checkpoint
  ↓
Emit progress
  ↓
Build Vietnamese SRT
```

### 10.3 Main translation components

The worker currently uses modules for:

- dictionary candidate resolution,
- contextual disambiguation,
- terminology authority,
- terminology planning,
- terminology registry,
- meaning frame construction,
- meaning guard validation,
- semantic evidence evaluation,
- explicit learning memory,
- local Hachimi translator.

### 10.4 Translation status rules

- `PASS`: no blocking findings.
- `REVIEW`: warnings/findings require attention but no hard FAIL.
- `FAIL`: one or more error-level findings.

If overall result is REVIEW and there are no FAIL segments, Desktop asks the user whether to approve the translation before continuing to TTS.

If FAIL exists, TTS remains blocked until corrected/accepted content is supplied.

### 10.5 Checkpoint and resume

Translation worker stores checkpoint data containing:

- schema,
- worker version,
- job ID,
- source digest,
- completed/total count,
- translated segment results.

Resume only trusts a checkpoint when source digest and worker version still match.

### 10.6 Cancellation

Translation cancellation uses a per-job cancellation marker. Worker checks the marker between segments and exits safely.

---

## 11. Korean → Vietnamese translation

### Status: `NOT IMPLEMENTED / WAITING_MODEL`

The repository already contains Korean profile/template placeholders and Korean dictionary placeholder files, but the runtime translation path deliberately refuses Korean.

Current expected behavior:

```text
sourceLanguage = ko
  ↓
KO-VI PIPELINE: WAITING_MODEL
  ↓
Stop before TTS
```

`DO NOT` silently route Korean text into the Chinese Hachimi model.

Required future design:

1. Select KO→VI model(s).
2. Define model router contract.
3. Extend `TranslationRunResult.sourceLanguage` typing.
4. Build Korean terminology/context layer.
5. Add Korean model runtime installer/assets.
6. Add contract and quality tests.
7. Re-enable Korean UI controls only after engine health-check is real.

---

## 12. VieNeu Vietnamese TTS

### Status: `DONE`

Current TTS worker uses VieNeu v3 Turbo with local CPU-oriented configuration.

### 12.1 Engine behavior

- backend: ONNX
- device: CPU
- dtype: FP32
- output sample rate: 48 kHz
- preset voice validation before synthesis
- speed control
- pitch shifting
- technical progress events

### 12.2 Preset voices

Desktop exposes 23 preset voice choices. Actor preview MP3 and project TTS generation are intentionally separate flows.

### 12.3 Aligned subtitle-cue TTS

Preferred project generation uses timed cues:

```text
segmentId
startMs
endMs
text
```

For each cue:

1. synthesize speech,
2. calculate target duration,
3. if generated speech is longer than target duration, time-stretch it to fit,
4. place speech at the cue start time,
5. build a master A2 audio track,
6. peak-normalize the track,
7. write PCM WAV.

The resulting TTS response returns cue timing metadata and `aligned=true`.

### 12.4 Legacy/plain-text TTS mode

If no timed cues are provided, long text is split into smaller chunks to reduce decoder memory pressure. Chunks are generated sequentially and joined with short silence.

### 12.5 Known TTS limitations / future tuning

- CPU generation can still be slow on low-end machines.
- Time-stretch currently prioritizes fitting within a cue rather than advanced prosody preservation.
- There is no speaker cloning workflow in the current product.
- Background audio ducking/mixing is not part of final export yet.

---

## 13. Automatic pipeline

### Status: `PARTIAL but usable for the supported Chinese path`

Intended automated path:

```text
Video
  ↓
OCR recognition (if no dialogue file exists)
  ↓
ZH→VI translation (if not already accepted)
  ↓
TTS
  ↓
Commit project-ready state
```

Current stage state:

- `idle`
- `recognizing`
- `translating`
- `dubbing`
- `committing`
- `completed`

Important behavior:

- Existing dialogue file skips OCR.
- Existing accepted translated file skips translation.
- REVIEW pauses for user decision.
- FAIL blocks TTS.
- Korean source stops before unsupported translation/TTS.

Current `committing` stage is logical project state only; it is not yet a real media render operation.

---

## 14. Video preview workspace

### Status: `DONE`

Preview currently supports:

- video playback,
- play/pause,
- seek slider,
- step backward/forward,
- mute/unmute,
- volume,
- fullscreen,
- source video visibility,
- subtitle overlay,
- logo overlay.

### 14.1 Subtitle overlay

User can change:

- current active subtitle text,
- frame position,
- font size,
- text color,
- background color,
- opacity/transparency,
- outline on/off,
- outline width.

Subtitle box supports drag + resize handles.

The display layer also horizontally fits long text into the subtitle box.

### 14.2 Logo overlay

User can:

- import an image,
- move it,
- resize it,
- remove it.

Logo position/size are represented in the same stage coordinate system used by the preview.

### 14.3 Current limitation

Subtitle/logo visual state exists in the Desktop UI but is not yet serialized into a durable project file or passed into a real final render engine.

---

## 15. Timeline

### Status: `DONE for visualization/playback; not yet a real NLE edit graph`

Current tracks:

```text
V1  Source video
A1  Original audio
S1  Vietnamese subtitle
A2  Dubbed Vietnamese audio
```

### 15.1 Timeline behavior currently working

- canonical time space shared with source video,
- zoom,
- scrub from ruler and clips,
- playhead,
- markers,
- video thumbnails,
- source waveform visualization,
- subtitle blocks positioned by timecode,
- dubbed cue blocks positioned by timecode,
- keyboard playback/seeking,
- track visibility,
- mute/solo states,
- lock/sync UI state,
- context-menu timestamp capture.

### 15.2 Waveform implementation

The media hook publishes a usable visual waveform immediately so the UI is not blocked by media decoding limitations. It then attempts a WebAudio analysis pass.

This is good for UX but is not yet a sample-accurate native waveform extraction pipeline.

Recommended future change when editor functionality becomes real:

- native/FFmpeg audio analysis,
- cached waveform peaks tied to project media hash,
- waveform zoom levels.

### 15.3 Track-control limitation

Most lock/sync/solo controls currently manage UI/playback state. They are not yet connected to a non-destructive editing engine or render graph.

---

## 16. Editing panel

### Status: `UI ONLY`

The edit panel currently exposes the intended product surface:

- Cut at playhead
- Split clip
- Trim start
- Trim end
- Position
- Scale
- Rotation
- Speed
- Fade
- Dissolve
- Sharpen

But these controls currently do not transform a real clip graph or video file.

### Required architecture before implementing editing

Do not implement each button as an isolated destructive FFmpeg command.

First introduce a project model similar to:

```text
Project
├── sourceMedia
├── duration
├── videoClips[]
├── audioClips[]
├── subtitles[]
├── overlays[]
├── transitions[]
├── effects[]
└── exportSettings
```

Each edit action should update the project model. Final render should consume that model.

Recommended modules:

```text
src/features/project/
src/features/editor/
src/features/export/
src-tauri/src/media.rs
backend/render_worker.py   (only if a Python render worker is chosen)
```

---

## 17. Export / render

### Status: `NOT IMPLEMENTED`

The UI currently shows:

- MP4 (H.264)
- MKV
- output folder field
- export action

but `handleFinalExport()` currently only marks export as queued/logical. There is no production render engine.

### Recommended export implementation

Priority order:

1. Introduce durable project state.
2. Build native output-folder picker.
3. Add FFmpeg runtime detection/packaging.
4. Generate deterministic render plan.
5. Render source video + A1/A2 audio policy.
6. Burn or embed S1 subtitles based on export option.
7. Composite logo/subtitle overlay.
8. Add progress + cancellation.
9. Write to temporary file first.
10. Atomically rename on success.
11. Persist render log and FFmpeg command diagnostics.

### Background-audio mode

UI state already exists for:

- `reduce`
- `keep`
- `mute`

but final audio mixing policy has not yet been implemented in export.

---

## 18. Settings and shortcuts

### Status: `DONE`

Preferences currently persisted in `localStorage` include:

- UI language,
- theme,
- global shortcut enable/disable,
- playback seek step,
- loop playback,
- start muted,
- default timeline zoom,
- auto subtitle frame,
- subtitle panel startup,
- reduced motion.

Keyboard shortcuts include:

- `Ctrl + Shift + L` — language
- `Ctrl + Shift + T` — theme
- `Ctrl + Shift + S` — subtitle panel
- timeline `Space` — play/pause
- timeline `Left / Right` — seek
- `Home / End` — timeline start/end

### Future improvement

Settings are persisted, but there is no versioned settings schema/migration layer. Add one before the number of settings becomes much larger.

---

## 19. Technical logging

### Status: `DONE`

The UI keeps a concise visible live log while also appending to a persistent technical log through Tauri.

Main logged systems include:

- app workflow,
- recognition,
- translation,
- TTS,
- payment gateway,
- license state,
- update workflow.

Current visible log is intentionally limited to a small number of recent entries.

### Recommended future improvements

- Add correlation IDs for a full project run.
- Add payment/order ID-safe diagnostic context without exposing secrets.
- Add log severity filtering in UI.
- Export the full persisted log, not only visible recent lines.
- Add automatic log rotation/retention.

---

## 20. App update system

### Status: `DONE`

Desktop updater behavior:

1. app loads,
2. reads current app version,
3. performs a silent update check shortly after startup,
4. shows update availability in the topbar,
5. can download signed updater artifact,
6. installs update,
7. supports relaunch.

Tauri configuration uses a pinned updater public key and GitHub Release `latest.json` endpoint.

### Version consistency requirement

Current version appears in multiple locations:

- `package.json`
- `package-lock.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

Release tooling already checks/synchronizes these during a release build.

### Known presentation issue

`AboutPopover.tsx` still contains a hard-coded display version from an older baseline. It should use Tauri `getVersion()` or the same app-update version source instead of a literal string.

Priority: `LOW`, easy cleanup.

---

## 21. About / donation

### Status: `DONE`

Donation data is not trusted blindly from editable frontend text.

Rust:

- loads donation manifest,
- validates schema/enabled state,
- hashes canonical payload,
- verifies Ed25519 signature using a pinned public key,
- generates VietQR only after verification succeeds.

The private signing key is not intended to ship inside the application.

This pattern is a good reference for future server-signed offline-license hardening.

---

## 22. Current source-of-truth rules

### 22.1 Backend-authoritative data

Desktop must not independently invent or override:

- package price,
- package duration,
- device limit,
- payment account,
- order status,
- license status,
- license expiry,
- license token.

### 22.2 Desktop-authoritative UI/project state

Desktop currently owns:

- selected local source video,
- playback state,
- preview state,
- subtitle styling,
- logo styling,
- timeline visual state,
- translation/TTS workflow state,
- local user preferences.

### 22.3 External backend systems

Not stored in this repository:

- Apps Script Payment Gateway backend,
- backing Sheets data,
- Android bank-notification gateway.

Any future change that modifies order/payment/license contracts must be coordinated across those systems.

---

## 23. Critical compatibility invariants

These are current `DO NOT BREAK` rules.

### Payment / license

1. Desktop never manually marks an order PAID.
2. Desktop never creates a fake License locally.
3. `checkOrder` remains protected by `order_access_token`.
4. `cancelOrder` remains protected by `order_access_token` and machine context.
5. `PAID` without `license_token` remains pollable.
6. One payment event must not create duplicate license/payment side effects.
7. Current active license must survive a cancelled renewal attempt.
8. Machine binding must remain stable.

### Translation

1. Korean must not fall back into the Chinese model.
2. FAIL translation must not silently reach TTS.
3. Timed segment IDs/timecodes must survive OCR → translation → TTS → timeline.
4. Checkpoint reuse must require matching source digest + worker version.

### TTS

1. Actor preview is separate from generated project audio.
2. Aligned cue metadata must remain available for A2 timeline placement.

### Release

1. Updater private signing key must remain outside tracked source.
2. Secrets must never be copied into frontend source or logs.

---

## 24. Completed items that should be preserved

### Payment/security milestone

The following sequence has been verified end-to-end:

```text
Desktop create Order/QR
→ real bank transfer
→ Android notification parse
→ resolve Order
→ payment queue
→ backend receivePayment
→ Payment row
→ Order PAID
→ License creation
→ Desktop polling
→ temporary PAID/no-token handled safely
→ license token received
→ checkLicense
→ activateDevice
→ local token/state saved
→ main UI ACTIVE
```

This path is considered a stable baseline.

### Core Chinese media path

Usable today:

```text
Video
→ Chinese subtitle OCR
→ timed subtitle/dialogue
→ ZH→VI translation
→ user review when needed
→ VieNeu TTS
→ aligned A2 WAV
→ preview + S1/A2 timeline
```

---

## 25. Partial or unfinished functionality

### 25.1 Recognition

- Chinese subtitle OCR: complete baseline.
- Chinese ASR: missing.
- Korean OCR: missing.
- Combined ASR + OCR fusion: missing.

### 25.2 Translation

- Chinese → Vietnamese: implemented.
- Korean → Vietnamese: missing model/runtime.
- Translation learning UI for explicit user corrections: backend memory support exists, but a polished correction-management workflow is still absent.

### 25.3 Editing

- Visualization controls exist.
- Real clip operations do not.
- No undo/redo command stack.
- No durable project file.

### 25.4 Export

- UI exists.
- Actual renderer/encoder is missing.

### 25.5 License security

- Online authority is correct.
- Offline snapshot is not cryptographically signed/protected yet.

### 25.6 Test coverage

Good automated coverage currently concentrates on translation behavior. Equivalent automated coverage is still needed for:

- payment polling race,
- payment modal state machine,
- license offline grace,
- machine mismatch,
- React/Tauri integration,
- recognition contract,
- TTS aligned-cue contract,
- updater model,
- editor/export when implemented.

---

## 26. Technical debt / cleanup backlog

### Priority A — before major new paid-production growth

1. Harden offline license state with a server signature and Windows secure storage.
2. Add regression tests for payment/license Desktop state machine.
3. Add release provenance guard: clean tree + HEAD synchronized with remote + known commit/tag before building a release.
4. Keep the current E2E payment flow unchanged while doing the above.

### Priority B — architecture before editor/export

1. Create a durable project model.
2. Extract more orchestration logic from `AIRDvD.tsx`.
3. Add editor command model + undo/redo.
4. Add render/export service.
5. Define media cache strategy.

### Priority C — functional expansion

1. Add Chinese ASR.
2. Add Korean OCR.
3. Add KO→VI translation model/runtime.
4. Add audio mix/ducking implementation.
5. Add subtitle burn-in/embed options.

### Priority D — maintenance cleanup

1. Replace hard-coded About version with runtime version.
2. Consolidate duplicated `checkLicense` / `activateDevice` service wrappers.
3. Show real active-device count instead of assuming `1 / limit` when backend supports it.
4. Clean duplicate `.gitignore` sections.
5. Add `*.bak` ignore rule if backup files are intentionally local-only.
6. Move inline license-card CSS animation out of `WorkflowSidebar.tsx` into style files.
7. Add versioned user-settings schema.

---

## 27. `AIRDvD.tsx` refactor recommendation

Current `AIRDvD.tsx` is the central orchestrator for many independent responsibilities:

- settings,
- license gate,
- video project state,
- OCR,
- translation,
- TTS,
- timeline,
- subtitle drag/resize,
- logo drag/resize,
- audio synchronization,
- keyboard handling,
- top-level rendering.

It works, but adding more features directly into this file will increase regression risk.

Recommended extraction direction:

```text
src/features/project/useProject.ts
src/features/media/usePlayback.ts
src/features/subtitles/useSubtitleEditor.ts
src/features/overlays/useLogoOverlay.ts
src/features/timeline/useTimelineController.ts
src/features/editor/useEditorCommands.ts
src/features/export/useExport.ts
```

Do not refactor everything in one large change. Use one isolated feature extraction at a time with build/regression checks.

---

## 28. Recommended next feature-development sequence

If the goal is to evolve AI RDvD from a workflow prototype into a complete desktop editor, the safest order is:

### Phase 1 — protect the stable commercial core

- payment/license regression tests,
- offline-license hardening,
- release provenance checks.

### Phase 2 — formal project model

- project state schema,
- source media metadata,
- subtitle/overlay serialization,
- save/open project.

### Phase 3 — real editor operations

- clip split,
- trim,
- move/reorder,
- transform,
- undo/redo.

### Phase 4 — real export

- FFmpeg integration,
- audio mixing,
- subtitle rendering,
- logo rendering,
- progress/cancel,
- MP4 output first.

### Phase 5 — recognition expansion

- ASR,
- OCR + ASR merge,
- Korean OCR.

### Phase 6 — Korean translation

- KO→VI model,
- Korean terminology resources,
- quality/test pipeline.

---

## 29. Testing policy for future changes

Use the project’s established safety pattern:

```text
one change
→ build/test
→ PASS/FAIL recorded
→ only then continue
```

### Minimum frontend check

```bat
cd /d E:\ai-rdvd-ui
npm run build
```

Expected pipeline:

```text
tsc && vite build
```

### Desktop development run

```bat
cd /d E:\ai-rdvd-ui
npm run tauri:dev
```

or:

```bat
npx tauri dev
```

### Python translation tests

Run repository tests when translation core is changed.

At minimum, preserve:

- MeaningGuard behavior,
- translation worker contract,
- checkpoint/resume behavior,
- timed-segment integrity.

### Payment changes

Do not repeat a bank transfer for the same order. A real payment regression test must use a new order and only one transfer per order.

---

## 30. Environment setup

### Install Node dependencies

```bat
npm install
```

### Import existing local TTS environment

```bat
powershell -ExecutionPolicy Bypass -File scripts/import-tts-environment.ps1
```

### Import existing local translation environment

```bat
powershell -ExecutionPolicy Bypass -File scripts/import-translation-environment.ps1
```

### Run Desktop

```bat
npm run tauri:dev
```

### Frontend production build

```bat
npm run build
```

### Tauri build

```bat
npm run tauri:build
```

### NSIS executable build

```bat
npm run tauri:build:exe
```

---

## 31. Release workflow and required change

The repository includes:

```text
AI-RDvD-RELEASE-ONECLICK.bat
```

Current script can:

- validate required tools,
- validate installer assets,
- read current release version,
- update version files,
- build NSIS/updater artifacts,
- calculate SHA-256,
- create/update GitHub Release,
- upload release artifacts.

However, the script explicitly describes itself as **no commit / no push**.

### Risk

A release can theoretically be built from local working-tree content that does not exactly match the source commit/tag represented on GitHub.

### Required hardening

Before production release, add a provenance gate equivalent to:

```text
git status --porcelain must be clean
HEAD must equal origin/main
version files must be synchronized
release tag must point to the exact build commit
build must happen after those checks
```

Do not embed private updater signing keys in tracked files.

---

## 32. Repository/runtime data policy

The repository intentionally ignores local/generated data such as:

- Node dependencies,
- Rust build target,
- output files,
- audio runtime assets,
- local AI model files,
- local secrets,
- release artifacts,
- backup folders.

This means a clean clone requires setup/import steps for local AI runtime resources before all features become ready.

`translation-assets/models/` is intentionally not tracked as normal source.

---

## 33. Suggested module ownership for new functionality

When adding a new Desktop feature, prefer this rule:

### React layer

Owns:

- UI state,
- user interaction,
- workflow presentation,
- progress display.

### Tauri/Rust layer

Owns:

- filesystem paths,
- process execution,
- secure storage,
- machine identity,
- restricted network bridges,
- native dialogs,
- native media/FFmpeg orchestration when appropriate.

### Python worker layer

Owns:

- AI inference,
- NLP/OCR/TTS model execution,
- model-specific processing.

### Backend Payment Gateway

Owns:

- commercial catalog,
- payment/order state,
- license creation,
- license expiry/status,
- device entitlement.

Do not move backend business authority into frontend code.

---

## 34. Security rules for development

1. Never commit updater private keys.
2. Never expose license tokens in UI/logs unnecessarily.
3. Never log raw payment secrets/access tokens.
4. Keep Payment Gateway host validation.
5. Keep request-size and timeout controls.
6. Keep server authoritative for paid state.
7. Treat local license cache as a cache, not commercial source of truth.
8. Any offline entitlement must be cryptographically verifiable before increasing offline trust.
9. Never ship a private donation signing key.
10. Do not disable signature verification merely to simplify local development.

---

## 35. Current baseline summary

### Stable and production-like

- Desktop shell.
- Main workflow UI.
- Settings persistence.
- Payment order/QR flow.
- Android/backend/Desktop payment E2E integration.
- License activation/renewal.
- PAID/license-token race handling.
- Chinese subtitle OCR.
- Chinese → Vietnamese translation.
- Translation quality guard/review.
- VieNeu TTS and aligned dubbed track.
- Preview and multi-track timeline visualization.
- Technical logs.
- Signed app updater.
- Signed donation manifest.

### Usable but still needs architecture/quality work

- offline license security,
- waveform generation,
- monolithic top-level orchestration,
- test coverage outside translation,
- release provenance checks.

### Not finished yet

- voice ASR,
- Korean OCR,
- Korean → Vietnamese translation,
- real non-linear editing,
- undo/redo,
- project save/open,
- real render/export engine,
- real effects/transitions,
- final audio mixing.

---

## 36. Development baseline rule

For future implementation work, treat the audited payment/security baseline as protected behavior.

Before modifying a feature:

1. read the current GitHub version of the relevant files,
2. define the exact state/data contract that changes,
3. avoid unrelated refactors in the same patch,
4. build/test,
5. verify no regression in payment/license when shared code changes,
6. commit only after the patch passes.

The next large Desktop capabilities should be designed around a durable project model instead of adding more ad-hoc state directly to `AIRDvD.tsx`.

---

## 37. Historical documentation

Older architecture and implementation notes remain available under:

```text
docs/history/readme/
```

Important historical milestones include:

- V45 architecture refactor,
- V46 TTS/runtime/Windows packaging,
- V46.2 Windows UTF-8 + technical logging,
- V46.3 concise Live Log + AppData log + TTS chunking,
- V46.4 actor preview vs project TTS separation,
- V47 Vocalize/Hachimi Chinese → Vietnamese translation worker.

This README is now the primary current-state document; historical READMEs should be treated as implementation history, not the current source of truth.
---

## 38. Current state update â€” 2026-10-14

This section supersedes older status statements elsewhere in this README when they conflict with current source. Historical sections are intentionally retained for development context.

### 38.1 Current audited baseline

```text
Pre-SECURITY-10F HEAD:
fb122b2 — security: add trusted time rollback protection

Checkpoint:
checkpoint/security-trusted-time-2026-10-14

Application version:
0.1.5
```
### 38.2 Render / runtime status

The earlier README sections that describe final render/export as missing are now historical.

Current source includes a real Rust/FFmpeg render path with:

- MP4 output,
- H.264 video,
- AAC audio,
- native source/output path validation,
- typed render settings,
- subtitle rendering,
- logo overlay,
- progress events,
- cancellation,
- temporary output before finalization,
- duplicate-job/output protection,
- render environment preflight,
- open/reveal output actions.

Runtime infrastructure also includes FFmpeg/module auto-provision support with HTTPS download, SHA-256 checking, size checks, staging, atomic activation and rollback safeguards.

The product is still not a complete non-linear editor: durable project graph, real cut/split/trim operations, effects/transitions, advanced ducking and some generalized A1/A2 mixing remain future work.

### 38.3 License / access security status

Security milestones:

```text
SECURITY-10A  DONE
Server-issued signed offline entitlement

SECURITY-10B  DONE
Rust RS256 entitlement verifier with pinned public key

SECURITY-10C  DONE
Windows DPAPI protection for the local license token

SECURITY-10D  DONE + E2E PASS
Rust-authoritative offline authorization

SECURITY-10E  DONE + AUTOMATED PASS
Trusted-time / clock-rollback hardening

SECURITY-10F  DONE + E2E PASS
Local-state schema v3 migration and cleanup
```
Current SECURITY-10D architecture:

```text
online verification
  â†“
backend returns signed offline_entitlement
  â†“
Rust verifies:
  RS256 signature
  pinned key
  machine_id
  device_fingerprint
  ACTIVE status
  license expiry
  offline grace
  â†“
verified entitlement is saved with local snapshot
```

When online verification is unavailable:

```text
local signed entitlement
  â†“
Rust verify_offline_entitlement
  â”œâ”€â”€ reject â†’ no offline authorization
  â””â”€â”€ verify â†’ ACTIVE during the signed grace window
```

Mutable frontend/local values such as `Date.now()`, `offlineGraceUntilMs` and stored `license.status` are no longer sufficient to grant offline access.

The local license token remains protected using Windows DPAPI (`dpapi:v1:`), including migration from legacy plaintext state.

Trusted time is persisted separately in DPAPI-protected `trusted-time-state.json`; offline entitlement verification uses the Rust guarded-time path and rejects clock rollback beyond the configured tolerance.

Local license persistence now uses schema v3. Schema v1/v2 state is migrated on read, legacy `lastVerifiedAtMs` / `offlineGraceUntilMs` fields are removed, and the signed `offline_entitlement` remains inside the local license snapshot only after Rust verification.

Free Hour access remains server-authoritative and does not gain a fabricated local grant when network/server checks fail.

### 38.4 SECURITY-10D validation record

Final automated validation before commit:

```text
git diff --check                         PASS
npm run build                            PASS
SECURITY-10D static assertions           PASS â€” 14/14
cargo test offline_entitlement           PASS â€” 5/5
cargo test                               PASS â€” 11/11
cargo check                              PASS
```

Behavioral E2E validation:

```text
Online ACTIVE license                    PASS
Backend issued offline_entitlement       PASS
Rust verified entitlement before save    PASS
Valid signed entitlement while offline   PASS
Tampered signature while offline         PASS â€” rejected / fail-closed
```

Observed valid offline event:

```text
OFFLINE_ENTITLEMENT_ACTIVE
```

Observed tamper event:

```text
OFFLINE_ENTITLEMENT_REJECTED
```

A tampered entitlement signature keeps the workspace locked.

Not re-run as part of this specific SECURITY-10D validation:

- a new real bank-transfer purchase,
- a new full renewal purchase,
- cross-machine replay on a second physical machine,
- waiting in real time for the full 72-hour grace boundary.

Those remain release/regression cases rather than claims of this patch.

### 38.5 SECURITY-10E / SECURITY-10F validation record

SECURITY-10E automated validation:

```text
git diff --check                         PASS
npm run build                            PASS
SECURITY-10E static assertions           PASS
trusted-time Rust tests                  PASS — 3/3
offline-entitlement Rust tests           PASS — 7/7
cargo test                               PASS — 16/16
cargo check                              PASS
```

SECURITY-10F automated validation:

```text
git diff --check                         PASS
npm run build                            PASS
SECURITY-10F static assertions           PASS
trusted-time regression tests            PASS — 4/4
cargo test                               PASS — 16/16
cargo check                              PASS
```

SECURITY-10F live migration / regression:

```text
schema v2 -> schema v3 migration         PASS
DPAPI token retained                     PASS
machine/license snapshot retained        PASS
signed offline_entitlement retained      PASS
legacy local time fields removed         PASS
offline launch with network disabled     PASS
OFFLINE_ENTITLEMENT_ACTIVE               observed
```

SECURITY-10E clock-rollback detection is covered by Rust tests; this record does not claim a live Windows-clock rollback simulation.

### 38.6 Next security work

After SECURITY-10F:

1. Add native entitlement enforcement before valuable Rust operations such as recognition, translation, TTS and render/export.
2. Review `claimTrial` against the protected Desktop-HMAC action list before exposing direct claim UI.
3. Consolidate security regression scripts into repository-owned tests.
4. Keep cross-machine replay and full real-time offline-grace-boundary testing in the release/regression matrix.
### 38.7 Repository mutation rule

Project workflow remains:

```text
audit
â†’ local patch
â†’ build/test
â†’ PASS
â†’ explicit staging
â†’ commit/tag/push only with user approval
```

Do not use `git restore`, `reset`, `clean` or `stash` as part of the normal patch workflow.

Do not automatically stage local runtime/log/backup artifacts such as:

```text
R7-2-MSI-build-log.txt
R7-2-ffmpeg-packaging-snapshot.txt
R7-3-runtime-bootstrap-snapshot.txt
R7-4-ffmpeg-auto-provision-snapshot.txt
R7-5-module-auto-provision-snapshot.txt
runtime/ffmpeg/
src-tauri/src/donation - Copy.rs
```

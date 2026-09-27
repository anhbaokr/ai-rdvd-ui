# AI RDvD UI V47 — Vocalize translation worker

V47 connects the existing Step 3 UI to the translation flow audited from
Vocalize Translation Lab. The visual layout, Timeline structure, topbar menus,
TTS actor preview, and established V46.4 project flow remain in place.

## Translation data flow

1. Load a Chinese TXT, SRT, VTT, or JSON dialogue file in Step 3.
2. AI RDvD creates stable segment IDs and preserves source timestamps.
3. The isolated translation worker applies the Vocalize pipeline:
   context window, MeaningFrame, CVDICT/Han-Viet evidence, terminology
   authority/registry/planner, local HachimiMT, Semantic Evidence, and
   MeaningGuard.
4. A checkpoint is written after every segment. Re-running the same source
   resumes completed segments.
5. PASS output becomes an accepted Vietnamese SRT and may continue to TTS.
6. REVIEW output is shown on S1 and requires an explicit user decision. The
   user may approve it for TTS or cancel and upload a corrected subtitle file.
7. FAIL output is shown on S1 but always blocks TTS until a corrected subtitle
   file is uploaded.

Hachimi receives only the current source segment. Previous and following
segments provide terminology and guard context; they are not concatenated into
the model input, so adjacent subtitles cannot leak into the current result.

## Import the existing Vocalize environment

Run from CMD in `E:\ai-rdvd-ui`:

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\import-translation-environment.ps1 -SourceRoot "E:\Vocalize-Translation-Lab"
```

The script copies the translation venv into `.translation-venv`, copies model
and dictionaries into `translation-assets`, writes SHA-256 inventory metadata,
and runs a worker health check. TTS and translation use separate environments.

## First-use download

If no translation environment is installed, pressing **Start translation**
asks for confirmation and then installs into the application data directory.
The installer resolves and records the exact Hugging Face and GitHub commits,
hashes downloaded files, and performs a health check before activation.

For a manual development install:

```cmd
npm run translation:setup:windows
```

## Test procedure

1. Start the desktop app with `npm run tauri:dev`.
2. In Step 3, upload a UTF-8 Chinese dialogue file.
3. Press **Start translation**.
4. Watch progress on the existing button and in Live Log.
5. Inspect Vietnamese subtitle blocks on track S1.
6. Open the technical log folder for full diagnostics and the checkpoint path.

TXT input without timestamps is distributed across the current video duration.
AI-RDvD also accepts its ASR timestamped TXT contract and preserves cue IDs and
millisecond timecodes through translation, Timeline, subtitle output, and TTS:

```text
// Định dạng thời gian: HH:MM:SS.mmm

001 | 00:00:01.400 --> 00:00:01.720
不好
```

For an exact Timeline test, use this timestamped TXT contract or SRT/VTT/JSON
containing source timestamps.

## Validation in this delivery

- TypeScript production build passes.
- Eight Python tests cover PASS/REVIEW/FAIL guard behavior, checkpoints,
  resume behavior, exact millisecond timecodes, stable segment validation,
  proper-name handling, and rejection of Chinese residue.
- The ASR timestamped TXT fixture parses all 16 cues, preserves IDs/timecodes,
  renders on S1, and strips metadata/timecode lines before TTS.
- Rust/Tauri compilation must be run on the Windows development machine because
  the current audit environment does not include the Rust toolchain.

## Packaging note

The worker code and first-use installer are bundled. Large model and dictionary
assets are not embedded in the installer. Their upstream licenses, especially
CVDICT and HachimiMT, must be approved before any redistributable offline bundle
is published.

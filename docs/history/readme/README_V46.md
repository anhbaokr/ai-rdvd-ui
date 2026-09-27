# AI RDvD UI V46 — VieNeu TTS

V46 keeps the V45 component/CSS architecture and adds a real desktop TTS bridge
to step 4 (`Lồng tiếng + Phụ đề`). The web UI never reads arbitrary local paths:
Tauri validates the selected actor, reads the matching MP3, and invokes Python
without a shell.

## 23 actors

The dropdown uses the exact 23 VieNeu v3 Turbo preset IDs reported by
`V3TurboVieNeuTTS.list_preset_voices()`. Generation uses the preset name. The MP3
is only the preview. Two existing preview stems intentionally differ from the
preset spelling:

- preset `Phạm Tuyên` → `02-Phạm-Tuyền.mp3`
- preset `Xuân Vĩnh` → `04-Xuân-Vinh.mp3`

Put all preview files in `E:\ai-rdvd-ui\audio`. Before a Windows build, copy
them into the project `audio` folder too; Tauri bundles that folder so previews
continue working on a client machine.

## Reuse the tested environment

The following command creates a new project-local venv, copies installed
packages from the tested environment, installs any missing V46 dependency and
verifies that VieNeu returns exactly 23 voices:

```powershell
cd E:\ai-rdvd-ui
powershell -ExecutionPolicy Bypass -File scripts\import-tts-environment.ps1
```

Do not copy `.venv` by hand. Python venv launchers and `pyvenv.cfg` may retain
the old path. The migration script recreates the venv shell in its final
location before copying `site-packages`.

For a clean install without the old environment:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-tts-windows.ps1
```

VieNeu's official Windows prerequisites include Python 3.10+ and eSpeak NG.
The setup script checks eSpeak NG and verifies the same ONNX/CPU/fp32 engine used
by the application.

## Runtime resolution order

The backend resolves Python in this order:

1. `AI_RDVD_PYTHON`
2. `E:\ai-rdvd-ui\.venv\Scripts\python.exe`
3. optional project/bundled `runtime\python\python.exe`
4. tested legacy environment `E:\Menu04-TTS-Test\.venv\Scripts\python.exe`
5. `python.exe` / `py.exe` on `PATH`

Other optional overrides:

- `AI_RDVD_HOME`
- `AI_RDVD_AUDIO_DIR`
- `AI_RDVD_OUTPUT_DIR`
- `AI_RDVD_TTS_WORKER`

Generated WAV files are written to `E:\ai-rdvd-ui\output\tts` during development.
On a client without that project folder they go to the app-local data directory,
so an installed application never attempts to write into `Program Files`.

## Packaging modes

The normal package stays light and expects the client-side engine installer to
be added as a follow-up. The backend already probes the Tauri app-local data
path under `%LOCALAPPDATA%` for `tts-runtime`, and the UI already exposes engine state,
the diagnostic message and retry behavior required for that installer flow.

For an offline/internal package, prepare an embedded runtime before building:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\import-tts-environment.ps1 -PrepareOfflineRuntime
npm run tauri:build:exe
```

This copies the base Python runtime and TTS packages under `runtime/python`,
which Tauri includes as resources. It makes NSIS/MSI substantially larger and
does not embed the Hugging Face model cache; model files still download on first
use unless a separate managed cache is provided.

Only synthesize or distribute voices for which you have the necessary rights
and consent.

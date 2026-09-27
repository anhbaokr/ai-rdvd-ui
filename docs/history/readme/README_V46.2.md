# AI RDvD UI V46.2 — UTF-8 + Technical Diagnostics

V46.2 fixes the Windows `UnicodeEncodeError` raised by the VieNeu worker and
adds end-to-end diagnostics without changing the established layout or media
workflow.

## Changes

- Forces UTF-8 in both the Tauri child process and Python worker.
- Emits ASCII-safe JSON so Vietnamese messages cannot break IPC on legacy
  Windows console code pages.
- Shows environment, Python, worker, audio preview, model and WAV-generation
  events in the existing Live Log panel.
- Keeps up to 500 visible log lines instead of 10.
- Persists technical logs to `E:\ai-rdvd-ui\output\logs\ai-rdvd-technical.log`
  when the project is run from its standard location.
- Connects **Open log folder** to Windows File Explorer.
- Accepts VieNeu installations with 23 or more preset voices; the UI continues
  to expose the approved 23 voices.
- Makes the import script stop correctly if voice verification fails.

## Update an existing V46/V46.1 project

1. Stop `npm run tauri:dev`.
2. Extract this archive over `E:\ai-rdvd-ui`.
3. Keep the existing `.venv` and `audio` directory.
4. Run:

   ```cmd
   cd /d E:\ai-rdvd-ui
   npm install
   npm run tauri:dev
   ```

The TTS environment does not need to be imported again when
`E:\ai-rdvd-ui\.venv\Scripts\python.exe` already exists.

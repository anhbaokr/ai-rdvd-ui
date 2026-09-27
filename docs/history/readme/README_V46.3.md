# AI RDvD UI V46.3 — Production Logging + Memory-safe TTS

V46.3 keeps the existing interface and workflow while refining diagnostics for
normal daily use.

## Live Log

- Displays only the latest 20 operational events.
- Keeps high-level events such as readiness, selected preview, imported files,
  pipeline stages, TTS start, success and concise errors.
- Automatically scrolls to the newest event.
- Detailed Python, module, path, model and ONNX information remains in the
  persistent technical log.

## Persistent log

The log is stored in the current Windows user's application-data directory:

```text
%LOCALAPPDATA%\com.airdvd.app\logs\ai-rdvd-technical.log
```

This normally resolves to drive C and does not depend on the project drive.
Writes are serialized to prevent mixed/corrupted lines. At 5 MB the current log
is rotated to `ai-rdvd-technical.log.1`, limiting total retained logs to roughly
10 MB. **Clear log** removes the on-screen entries, both current log files and
the legacy V46.2 log under `E:\ai-rdvd-ui\output\logs` when it exists.

## TTS memory handling

The submitted diagnostic log showed ONNX Runtime `bad allocation` while
processing 363 characters. The worker now splits text into ordered chunks of up
to 120 characters, synthesizes them sequentially and joins them with a short
pause. This reduces peak decoder memory without changing the UI or pipeline.

## Updating V46.2

Stop the running application, extract this archive over `E:\ai-rdvd-ui`, then:

```cmd
cd /d E:\ai-rdvd-ui
npm install
npm run tauri:dev
```

The existing `.venv` and voice-preview MP3 files do not need to be recreated.

AI RDvD UI — V47

V45 architecture plus real VieNeu v3 Turbo TTS and 23 actor MP3 previews in
step 4. See README_V45.md for the refactor and README_V46.md for TTS setup,
runtime paths and Windows packaging choices.
See README_V46.2.md for the Windows UTF-8 fix and technical logging.
See README_V46.3.md for concise Live Log, AppData log storage and TTS chunking.
See README_V46.4.md for the separation between actor MP3 preview and project TTS.
See README_V47.md for the Vocalize/Hachimi Chinese-to-Vietnamese translation worker.

Run:
  npm install
  powershell -ExecutionPolicy Bypass -File scripts/import-tts-environment.ps1
  powershell -ExecutionPolicy Bypass -File scripts/import-translation-environment.ps1
  npx tauri dev

Build:
  npm run tauri:build

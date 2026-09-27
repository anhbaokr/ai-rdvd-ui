# AI RDvD UI V46.4 — Project-only TTS

V46.4 removes the redundant manual TTS branch while preserving the established
interface architecture and automatic pipeline.

## Final behavior

- Actor selection loads only the matching MP3 preview from the `audio` folder.
- The manual text area and standalone **Generate real speech** action have been
  removed.
- Project TTS text is read internally from the translated subtitle file when
  available, otherwise from the uploaded dialogue/subtitle file.
- VieNeu generation can only be called by the automatic pipeline.
- Timeline track A2 therefore receives only pipeline-generated project audio.
- Without an uploaded dialogue/subtitle source, the pipeline remains locked and
  explains the missing requirement.
- Loading another source file, or changing actor/speed/pitch, invalidates the
  previous pipeline result before another run.

Translation remains intentionally unchanged for the next design phase.

## Updating V46.3

Stop the running application, extract this archive over `E:\ai-rdvd-ui`, then:

```cmd
cd /d E:\ai-rdvd-ui
npm install
npm run tauri:dev
```

Keep the existing `.venv` and `audio` folders. No TTS environment re-import is
required.

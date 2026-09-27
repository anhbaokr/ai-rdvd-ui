# AI RDvD V40 — Tauri Workspace + Auto AI Pipeline State

V40 establishes the new desktop editor architecture requested by the user:

- Tauri custom titlebar drag surface with double-click maximize/restore.
- 25% workflow sidebar / 75% editor area.
- Right editor: Preview + Edit Video vertical column on top, Timeline spanning the full editor width below.
- Timeline remains an independent viewport; zoom does not resize the UI container.
- `✣ Nhận Dạng + Dịch + Lồng tiếng (Tự động)` is an AI-preparation pipeline only. It no longer performs final render/export.
- Auto stages: Recognition → Translation → Dubbing & Subtitle → Commit to Timeline.
- Existing dialogue/translated subtitle data cause ASR/Translation skips according to prior input-aware rules.
- After completion, the project is marked ready for editing and the Timeline shows the dubbed/subtitle track as prepared.
- Final export controls live in the Edit Video > Export tab. The actual render engine remains intentionally unconnected for the next stage.
- Edit Video panel contains functional UI state controls/placeholders for cut/split/trim/transform/speed/effects and a final export surface.

This version intentionally focuses on UI/workflow architecture before native render/AI module wiring.

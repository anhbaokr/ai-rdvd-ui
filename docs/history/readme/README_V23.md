# AI-RDvD UI V23 — Timeline Visibility + Preview Fullscreen + Subtitle Frame

## Changes
- Fixed the timeline layout at desktop/small-height screens: the timeline content is no longer compressed into a thin strip.
- Restored visible V1/A1/A2 track rows with minimum usable height.
- Video filmstrip, original-audio waveform and future dubbed-audio track remain linked to the timeline.
- Playhead remains synchronized with the real video currentTime.
- Timeline ruler scrubbing is bound to the time scale area, excluding track-header/control areas.
- Double-clicking the preview video toggles scene fullscreen.
- Preview fullscreen button now fullscreenes the whole preview scene so subtitle overlays remain included.
- After a real video is imported, the subtitle selection frame is shown immediately while subtitle CC visibility remains independent.
- The empty subtitle frame contains no fabricated dialogue text.
- V1 track visibility control is retained in the track header.

## Run
```cmd
cd /d E:\AI-RDvD-UI
npm install
npm run dev
```

This is a full project archive, not a patch.

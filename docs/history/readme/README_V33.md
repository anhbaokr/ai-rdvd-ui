# AI RDvD V33 — Canonical Timeline Time-Space

## Timeline correction

The Timeline now uses one canonical time-space for the ruler, media clips, markers and playhead.

- `timelineRulerDuration = videoDuration / timelineZoom` for every zoom level.
- At 50% zoom, a 60-second source occupies 50% of the available media lane and the visible ruler spans 0–120s.
- At 100% zoom, the full source occupies the available media lane and the ruler spans the source duration.
- Above 100%, the media lane grows with the scrollable canvas while the visible ruler shows the corresponding time window.
- The player timecode continues to show the real source time and uses the same `formatTimecode()` function as the Timeline.

This removes the previous mismatch caused by the ruler and media using different zoom/time coordinate calculations.

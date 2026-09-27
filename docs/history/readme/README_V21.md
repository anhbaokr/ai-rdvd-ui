# AI-RDvD UI V21 — Professional Interactive Timeline

Full project based on V20.

## Timeline changes
- Timeline is bidirectionally linked to the real video player.
- Click or drag across the video/audio timeline to seek the real video.
- Playhead follows the video's currentTime.
- Timeline Play/Pause, jump ±5s, Home/End.
- Space = Play/Pause while timeline is focused; Left/Right = seek, Shift+Left/Right = 1 second.
- Horizontal timeline zoom: 50%–400% and Fit.
- Real video filmstrip thumbnails from the imported video.
- Real audio waveform derived from the imported video audio track.
- Original audio mute/unmute is linked to the video element.
- Right-click context menu on timeline/clip: seek to position, add marker/cut point, mute/unmute original audio, Fit timeline, clear markers.
- Markers are interactive and seek the video when clicked.
- Removed the fake `Phụ đề (Trung)` / Chinese subtitle timeline track and the fake translated subtitle timeline track.
- Dubbed-audio row remains a placeholder until the real TTS module is connected; it does not claim to contain generated audio.

## Important scope
This is still a UI shell. Timeline editing commands such as an actual destructive/non-destructive split are represented as markers only until the real media/render engine is connected. No fake render operation is performed.

## Run
```cmd
cd /d E:\AI-RDvD-UI
npm install
npm run dev
```

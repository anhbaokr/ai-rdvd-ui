export function formatTimecode(seconds: number, fps = 30) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00:00:00';
  const safeFps = Math.max(1, Math.min(120, Math.round(fps)));
  const totalFrames = Math.max(0, Math.floor(seconds * safeFps + 1e-6));
  const frames = totalFrames % safeFps;
  const totalSeconds = Math.floor(totalFrames / safeFps);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

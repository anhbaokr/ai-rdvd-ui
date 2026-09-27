import type { SubtitleSegment } from '../types';

export function parseSubtitleTime(value: string) {
  const normalized = value.trim().replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length !== 3) return NaN;
  const [hours, minutes, seconds] = parts;
  const parsed = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function parseSubtitleFile(content: string, fallbackDuration = 0): SubtitleSegment[] {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
  if (!normalized) return [];
  const blocks = normalized.split(/\n{2,}/);
  const segments: SubtitleSegment[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const cueId = lines.find((line) => /^\d+$/.test(line)) || `seg-${String(segments.length + 1).padStart(6, '0')}`;
    if (!lines.length) continue;
    const timeLineIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeLineIndex >= 0) {
      const [rawStart, rawEnd] = lines[timeLineIndex].split('-->');
      const start = parseSubtitleTime(rawStart.replace(/^[A-Za-z0-9_.-]{1,96}\s*\|\s*/, ''));
      const end = parseSubtitleTime((rawEnd || '').trim().split(/\s+/)[0]);
      const text = lines.slice(timeLineIndex + 1).join(' ').trim();
      if (Number.isFinite(start) && Number.isFinite(end)) {
        segments.push({ id: cueId, start, end: Math.max(end, start + 0.25), text });
      }
      continue;
    }
    if (segments.length === 0 && fallbackDuration > 0 && !/^\d+$/.test(lines[0])) {
      segments.push({ id: 'seg-000001', start: 0, end: fallbackDuration, text: lines.join(' ') });
      break;
    }
  }
  return segments.sort((a, b) => a.start - b.start);
}

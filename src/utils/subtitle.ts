import type { SubtitleSegment } from '../types';

export function parseSubtitleTime(value: string) {
  const normalized = value.trim().replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length !== 3) return NaN;
  const [hours, minutes, seconds] = parts;
  const parsed = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseFlexibleSubtitleTime(value: string) {
  const normalized = value.trim().replace(/^[\[\(]+|[\]\)]+$/g, '').replace(',', '.');
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  return parseSubtitleTime(normalized);
}

function extractTimedRange(line: string) {
  const match = line.match(/(?:\[\s*)?((?:\d{1,2}:)?\d{2}:\d{2}(?:[.,]\d{1,3})?|\d+(?:\.\d+)?)\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}(?:[.,]\d{1,3})?|\d+(?:\.\d+)?)(?:\s*\])?/);
  if (!match) return null;
  const start = parseFlexibleSubtitleTime(match[1]);
  const end = parseFlexibleSubtitleTime(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end, index: match.index ?? 0, length: match[0].length };
}

export function parseSubtitleFile(content: string, fallbackDuration = 0): SubtitleSegment[] {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n{2,}/);
  const segments: SubtitleSegment[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    const cueId = lines.find((line) => /^\d+$/.test(line)) || `seg-${String(segments.length + 1).padStart(6, '0')}`;
    const timeLineIndex = lines.findIndex((line) => extractTimedRange(line));
    if (timeLineIndex < 0) continue;
    const rangeLine = lines[timeLineIndex];
    const range = extractTimedRange(rangeLine);
    if (!range) continue;

    const afterRange = rangeLine.slice(range.index + range.length).replace(/^\s*\]\s*/, '').trim();
    const bodyLines = [];
    if (afterRange) bodyLines.push(afterRange);
    bodyLines.push(...lines.slice(timeLineIndex + 1));
    const text = bodyLines.join(' ').trim();
    if (text) {
      segments.push({
        id: cueId,
        start: range.start,
        end: Math.max(range.end, range.start + 0.001),
        text,
      });
    }
  }

  // Some ASR transcripts use one timed line per cue without blank lines.
  // Parse those lines independently when the block parser found nothing.
  if (!segments.length) {
    const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
    for (let index = 0; index < lines.length; index += 1) {
      const range = extractTimedRange(lines[index]);
      if (!range) continue;
      const afterRange = lines[index].slice(range.index + range.length).replace(/^\s*\]\s*/, '').trim();
      let text = afterRange;
      if (!text && lines[index + 1] && !extractTimedRange(lines[index + 1])) text = lines[index + 1].trim();
      if (!text) continue;
      segments.push({
        id: `seg-${String(segments.length + 1).padStart(6, '0')}`,
        start: range.start,
        end: Math.max(range.end, range.start + 0.001),
        text,
      });
    }
  }

  // Do not turn an untimed plain-text file into a single full-length cue for Timeline.
  // A timeline cue must have a real timestamp; callers that need synthetic timing
  // for plain-text translation use parseTranslationSource separately.
  if (segments.length) return segments.sort((a, b) => a.start - b.start);
  if (fallbackDuration <= 0) return [];
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 1 && !/^\d+$/.test(lines[0])) {
    return [{ id: 'seg-000001', start: 0, end: fallbackDuration, text: lines[0] }];
  }
  return [];
}

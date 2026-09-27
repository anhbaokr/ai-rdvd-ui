import type { SubtitleSegment } from '../types';

export interface SubtitleDisplayCue {
  sourceIndex: number;
  partIndex: number;
  partCount: number;
  start: number;
  end: number;
  text: string;
}

const displayUnits = (text: string) => Array.from(text).reduce((total, character) => (
  total + (/\s/.test(character) ? 0.35 : /[.,!?;:…]/.test(character) ? 0.45 : 1)
), 0);

export function splitSubtitleText(text: string, maxUnits = 38, maxWords = 7): string[] {
  const words = text.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (!words.length) return [];

  const parts: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const currentWordCount = current ? current.split(' ').length : 0;
    if (current && (currentWordCount >= maxWords || displayUnits(candidate) > maxUnits)) {
      parts.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}

export function buildSubtitleDisplayCues(segments: SubtitleSegment[], maxUnits = 38, maxWords = 7): SubtitleDisplayCue[] {
  const cues: SubtitleDisplayCue[] = [];
  segments.forEach((segment, sourceIndex) => {
    const nextStart = segments[sourceIndex + 1]?.start;
    const effectiveEnd = typeof nextStart === 'number' && nextStart > segment.start
      ? Math.min(segment.end, nextStart)
      : segment.end;
    if (effectiveEnd <= segment.start) return;

    const parts = splitSubtitleText(segment.text, maxUnits, maxWords);
    if (!parts.length) return;
    const weights = parts.map((part) => Math.max(1, displayUnits(part)));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    const duration = effectiveEnd - segment.start;
    let elapsedWeight = 0;

    parts.forEach((part, partIndex) => {
      const start = segment.start + duration * (elapsedWeight / totalWeight);
      elapsedWeight += weights[partIndex];
      const end = partIndex === parts.length - 1
        ? effectiveEnd
        : segment.start + duration * (elapsedWeight / totalWeight);
      cues.push({ sourceIndex, partIndex, partCount: parts.length, start, end, text: part });
    });
  });
  return cues;
}

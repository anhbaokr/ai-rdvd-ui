import type { SubtitleSegment, TranslationSegmentInput, TranslationSegmentResult } from '../types';
import { parseSubtitleFile, parseSubtitleTime } from './subtitle';

function normalizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function fromSubtitleSegments(segments: SubtitleSegment[]): TranslationSegmentInput[] {
  return segments.map((segment, index) => ({
    segmentId: `seg-${String(index + 1).padStart(6, '0')}`,
    startMs: Math.max(0, Math.round(segment.start * 1000)),
    endMs: Math.max(Math.round(segment.start * 1000) + 250, Math.round(segment.end * 1000)),
    sourceText: normalizeText(segment.text),
  })).filter((segment) => Boolean(segment.sourceText));
}

const AIRDVD_TIMED_HEADER = /^([A-Za-z0-9_.-]{1,96})\s*\|\s*(\d{2,}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2,}:\d{2}:\d{2}[.,]\d{3})\s*$/;

/**
 * Parses the timestamped dialogue format emitted by the future AI-RDvD ASR flow:
 *
 * 001 | 00:00:01.400 --> 00:00:01.720
 * 不好
 *
 * IDs and millisecond timestamps are intentionally kept unchanged so the
 * translation, Timeline, subtitle, and TTS stages can refer to the same cue.
 */
export function parseAiRdvdTimedTranscript(content: string): TranslationSegmentInput[] {
  const lines = content.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n');
  const headers = lines.flatMap((line, lineIndex) => {
    const match = line.trim().match(AIRDVD_TIMED_HEADER);
    return match ? [{ lineIndex, match }] : [];
  });

  return headers.flatMap(({ lineIndex, match }, headerIndex) => {
    const nextHeaderLine = headers[headerIndex + 1]?.lineIndex ?? lines.length;
    const sourceText = normalizeText(lines
      .slice(lineIndex + 1, nextHeaderLine)
      .filter((line) => line.trim() && !line.trimStart().startsWith('//'))
      .join(' '));
    const startSeconds = parseSubtitleTime(match[2]);
    const endSeconds = parseSubtitleTime(match[3]);
    if (!sourceText || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) {
      return [];
    }
    return [{
      segmentId: match[1],
      startMs: Math.round(startSeconds * 1000),
      endMs: Math.round(endSeconds * 1000),
      sourceText,
    }];
  });
}

function parseJsonSegments(content: string): TranslationSegmentInput[] {
  const parsed: unknown = JSON.parse(content);
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { segments?: unknown }).segments)
      ? (parsed as { segments: unknown[] }).segments
      : [];
  return rows.flatMap((row, index) => {
    if (!row || typeof row !== 'object') return [];
    const value = row as Record<string, unknown>;
    const sourceText = normalizeText(value.sourceText ?? value.source ?? value.text);
    if (!sourceText) return [];
    const startSeconds = Number(value.start ?? 0);
    const endSeconds = Number(value.end ?? startSeconds + 3);
    const startMs = Number.isFinite(Number(value.startMs)) ? Number(value.startMs) : startSeconds * 1000;
    const endMs = Number.isFinite(Number(value.endMs)) ? Number(value.endMs) : endSeconds * 1000;
    return [{
      segmentId: normalizeText(value.segmentId ?? value.id) || `seg-${String(index + 1).padStart(6, '0')}`,
      startMs: Math.max(0, Math.round(startMs)),
      endMs: Math.max(Math.round(startMs) + 250, Math.round(endMs)),
      sourceText,
    }];
  });
}

function parsePlainText(content: string, fallbackDurationSeconds: number): TranslationSegmentInput[] {
  const lines = content.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n')
    .map(normalizeText)
    .filter(Boolean);
  if (!lines.length) return [];
  const weights = lines.map((line) => Math.max(1, Array.from(line).length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const totalMs = Math.max(
    lines.length * 750,
    Math.round((fallbackDurationSeconds > 0 ? fallbackDurationSeconds : lines.length * 3) * 1000),
  );
  let cursor = 0;
  return lines.map((sourceText, index) => {
    const startMs = cursor;
    const endMs = index === lines.length - 1
      ? totalMs
      : Math.max(startMs + 250, Math.round(startMs + (weights[index] / totalWeight) * totalMs));
    cursor = endMs;
    return {
      segmentId: `seg-${String(index + 1).padStart(6, '0')}`,
      startMs,
      endMs,
      sourceText,
    };
  });
}

export function parseTranslationSource(fileName: string, content: string, fallbackDurationSeconds: number) {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'json') {
    const segments = parseJsonSegments(content);
    if (segments.length) return segments;
  }
  if (content.includes('-->')) {
    const timedSegments = parseAiRdvdTimedTranscript(content);
    if (timedSegments.length) return timedSegments;
  }
  if (extension === 'srt' || extension === 'vtt' || content.includes('-->')) {
    const segments = fromSubtitleSegments(parseSubtitleFile(content));
    if (segments.length) return segments;
    // A timestamped file must not fall through to plain-text mode, otherwise
    // malformed cue IDs/timecodes could be sent to the translation model.
    return [];
  }
  return parsePlainText(content, fallbackDurationSeconds);
}

function srtTime(milliseconds: number) {
  const safe = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = safe % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

export function translationResultToSrt(segments: TranslationSegmentResult[]) {
  return segments.map((segment, index) => [
    /^\d+$/.test(segment.segmentId) ? segment.segmentId : String(index + 1),
    `${srtTime(segment.startMs)} --> ${srtTime(segment.endMs)}`,
    segment.targetText.trim(),
  ].join('\n')).join('\n\n') + '\n';
}

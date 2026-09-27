import { useCallback, useEffect, useRef, useState } from 'react';
import { checkTtsEnvironment, generateTts, listenTtsProgress, loadVoicePreview } from '../services/tts';
import type {
  Language,
  SubtitleSegment,
  TtsCue,
  TtsEnvironmentResult,
  TtsGenerationResult,
  TtsProgress,
  Voice,
  VoiceEngineState,
  VoicePreviewResult,
} from '../types';
import { extractTtsText } from '../utils/ttsText';

interface UseVoiceEngineOptions {
  voice: Voice;
  speed: number;
  pitch: number;
  dialogueFile: File | null;
  translatedFile: File | null;
  translationAccepted: boolean;
  language: Language;
  subtitleSegments: SubtitleSegment[];
  addLog: (message: string, category?: string) => void;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Không thể xử lý yêu cầu TTS.';
}

function userFacingTtsError(message: string, language: Language) {
  if (/bad allocation|out of memory|not enough memory/i.test(message)) {
    return language === 'vi'
      ? 'Không đủ bộ nhớ khi xử lý TTS. Worker đã chia nhỏ lời thoại; hãy đóng bớt ứng dụng và thử lại nếu lỗi còn xuất hiện.'
      : 'Not enough memory for TTS. The worker now splits long text; close other applications and try again if it persists.';
  }
  return message.length > 360 ? `${message.slice(0, 357)}...` : message;
}

export function useVoiceEngine({
  voice,
  speed,
  pitch,
  dialogueFile,
  translatedFile,
  translationAccepted,
  language,
  subtitleSegments,
  addLog,
}: UseVoiceEngineOptions) {
  const [ttsText, setTtsText] = useState('');
  const [textSource, setTextSource] = useState<string | null>(null);
  const [preview, setPreview] = useState<VoicePreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<TtsEnvironmentResult | null>(null);
  const [engineState, setEngineState] = useState<VoiceEngineState>('checking');
  const [generation, setGeneration] = useState<TtsGenerationResult | null>(null);
  const [generationRunning, setGenerationRunning] = useState(false);
  const [progress, setProgress] = useState<TtsProgress | null>(null);
  const generationBusy = useRef(false);
  const initialEnvironmentCheckStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const source = translatedFile && translationAccepted ? translatedFile : null;
    if (!source) {
      setTtsText('');
      setTextSource(null);
      return () => { cancelled = true; };
    }
    setTtsText('');
    setTextSource(source.name);
    source.text().then((content) => {
      if (cancelled) return;
      const extracted = extractTtsText(content);
      setTtsText(extracted);
      addLog(`Đã đọc ${source.name}: ${extracted.length.toLocaleString('vi-VN')} ký tự dùng cho TTS.`, 'TTS');
    }).catch((error) => {
      if (!cancelled) {
        const message = errorMessage(error);
        setTtsText('');
        addLog(`Không đọc được file nội dung: ${message}`, 'ERROR');
      }
    });
    return () => { cancelled = true; };
  }, [addLog, dialogueFile, translatedFile, translationAccepted]);

  const refreshEnvironment = useCallback(async () => {
    setEngineState('checking');
    addLog('Bắt đầu kiểm tra môi trường VieNeu.', 'TTS');
    try {
      const result = await checkTtsEnvironment();
      setEnvironment(result);
      setEngineState(result.ready ? 'ready' : 'missing');
      addLog(`${result.ready ? 'READY' : 'NOT READY'} — ${result.message}`, result.ready ? 'TTS' : 'ERROR');
      addLog(`File log kỹ thuật: ${result.logFilePath}`, 'LOG');
      return result;
    } catch (error) {
      setEnvironment(null);
      setEngineState('error');
      addLog(`Kiểm tra môi trường thất bại: ${errorMessage(error)}`, 'ERROR');
      throw error;
    }
  }, [addLog]);

  useEffect(() => {
    if (initialEnvironmentCheckStarted.current) return;
    initialEnvironmentCheckStarted.current = true;
    void refreshEnvironment().catch(() => undefined);
  }, [refreshEnvironment]);

  useEffect(() => {
    setGeneration(null);
    setProgress(null);
  }, [voice, speed, pitch, ttsText, subtitleSegments]);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);
    loadVoicePreview(voice).then((result) => {
      if (!cancelled) {
        setPreview(result);
        addLog(`Đã nạp nghe thử ${result.voiceName}: ${result.filePath}`, 'AUDIO');
      }
    }).catch((error) => {
      if (!cancelled) {
        const message = errorMessage(error);
        setPreviewError(message);
        addLog(`Không nạp được MP3 nghe thử: ${message}`, 'ERROR');
      }
    }).finally(() => {
      if (!cancelled) setPreviewLoading(false);
    });
    return () => { cancelled = true; };
  }, [addLog, voice]);

  const generateSpeech = useCallback(async (textOverride?: string, sourceOverride?: string, cues?: TtsCue[]) => {
    if (generationBusy.current) {
      throw new Error(language === 'vi' ? 'Tác vụ tạo giọng đang chạy.' : 'Voice generation is already running.');
    }
    const text = (textOverride ?? ttsText).trim();
    if (!text && !cues?.length) {
      const message = language === 'vi'
        ? 'Chưa có nguồn TTS. Hãy tải file lời thoại hoặc phụ đề trước khi chạy pipeline.'
        : 'There is no TTS source. Upload a dialogue or subtitle file before running the pipeline.';
      throw new Error(message);
    }
    generationBusy.current = true;
    setGenerationRunning(true);
    setProgress({ phase: 'engine', completed: 0, total: cues?.length ?? 1, percent: 0, message: language === 'vi' ? 'Chuẩn bị TTS' : 'Preparing TTS' });
    addLog(`Pipeline bắt đầu tổng hợp ${sourceOverride ?? textSource ?? 'bản dịch đã duyệt'}: voice=${voice}, chars=${text.length}, cues=${cues?.length ?? 0}, speed=${speed}, pitch=${pitch}.`, 'TTS');
    let unlisten: (() => void) | null = null;
    try {
      const normalizedCues = cues?.filter((cue) => cue.text.trim() && cue.endMs > cue.startMs).map((cue) => ({
        segmentId: cue.segmentId,
        startMs: Math.max(0, Math.round(cue.startMs)),
        endMs: Math.max(Math.round(cue.startMs) + 250, Math.round(cue.endMs)),
        text: cue.text.trim(),
      }));
      unlisten = await listenTtsProgress((next) => setProgress(next));
      const result = await generateTts({ text, voiceId: voice, speed, pitch, cues: normalizedCues?.length ? normalizedCues : undefined });
      setGeneration(result);
      setProgress({ phase: 'completed', completed: normalizedCues?.length ?? 1, total: normalizedCues?.length ?? 1, percent: 100, message: language === 'vi' ? 'Đã tạo WAV lồng tiếng' : 'Dubbed WAV created' });
      setEngineState('ready');
      addLog(`Tạo WAV thành công: ${result.outputPath}`, 'TTS');
      return result;
    } catch (error) {
      const message = userFacingTtsError(errorMessage(error), language);
      addLog(`Tạo giọng thất bại: ${message}`, 'ERROR');
      throw new Error(message);
    } finally {
      unlisten?.();
      generationBusy.current = false;
      setGenerationRunning(false);
    }
  }, [addLog, language, pitch, speed, textSource, ttsText, voice]);

  return {
    ttsText,
    textSource,
    preview,
    previewLoading,
    previewError,
    environment,
    engineState,
    refreshEnvironment,
    generation,
    generationRunning,
    progress,
    generateSpeech,
  };
}

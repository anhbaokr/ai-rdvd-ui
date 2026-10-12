import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import type { BoxState, SubtitleSegment } from '../../types';
import { STAGE_H, STAGE_W } from '../../constants/editor';
import { buildSubtitleDisplayCues } from '../../utils/subtitleDisplay';
import {
  checkRenderEnvironment,
  chooseExportOutputPath,
  cancelRender,
  startRender,
  openRenderOutput,
  revealRenderOutput,
} from './exportService';
import {
  DEFAULT_EXPORT_AUDIO_SETTINGS,
  DEFAULT_EXPORT_VIDEO_SETTINGS,
} from './exportContracts';
import type {
  ExportRequestV1,
  RenderEnvironmentResult,
  RenderError,
  RenderResult,
} from './exportContracts';

export type ExportUiStatus =
  | 'IDLE'
  | 'CHECKING_ENVIRONMENT'
  | 'READY'  | 'PREPARING'

  | 'RENDERING'
  | 'FINALIZING'
  | 'CANCEL_REQUESTED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ERROR';

interface UseExportOptions {
  pipelineDone: boolean;
  videoPath: string | null;
  sourceDurationMs: number;
  dubbedAudioPath: string | null;
  subtitleSegments: SubtitleSegment[];
  subtitleTrackVisible: boolean;
  subtitleBox: BoxState;
  subtitleSize: number;
  subtitleColor: string;
  subtitleBackgroundColor: string;
  subtitleTransparency: number;
  subtitleOutline: boolean;
  subtitleOutlineWidth: number;
  logoPath: string | null;
  logoBox: BoxState;
  addLog: (message: string, category?: string) => void;
}

function defaultOutputPath(videoPath: string | null): string | undefined {
  if (!videoPath) return undefined;
  const lastSlash = Math.max(videoPath.lastIndexOf('\\'), videoPath.lastIndexOf('/'));
  const directory = lastSlash >= 0 ? videoPath.slice(0, lastSlash + 1) : '';
  const fileName = lastSlash >= 0 ? videoPath.slice(lastSlash + 1) : videoPath;
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  return `${directory}${stem}.ai-rdvd.vi.mp4`;
}

function messageFromError(error: unknown): string {
  if (error && typeof error === 'object') {
    const value = error as Partial<RenderError> & { message?: string };
    if (value.code && value.message) return `${value.code}: ${value.message}`;
    if (value.message) return value.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function errorCodeFromError(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const value = error as Partial<RenderError>;
  return typeof value.code === 'string' && value.code.trim() ? value.code : null;
}

async function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Không sao chép được đường dẫn vào clipboard.');
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function useExport({
  pipelineDone,
  videoPath,
  sourceDurationMs,
  dubbedAudioPath,
  subtitleSegments,
  subtitleTrackVisible,
  subtitleBox,
  subtitleSize,
  subtitleColor,
  subtitleBackgroundColor,
  subtitleTransparency,
  subtitleOutline,
  subtitleOutlineWidth,
  logoPath,
  logoBox,
  addLog,
}: UseExportOptions){
  const [status, setStatus] = useState<ExportUiStatus>('IDLE');
  const [environment, setEnvironment] = useState<RenderEnvironmentResult | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [message, setMessage] = useState('Chưa kiểm tra môi trường render.');
  const [result, setResult] = useState<RenderResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const lastProgressLogBucketRef = useRef(-1);
  const mountedRef = useRef(true);
  const activeJobIdRef = useRef<string | null>(null);
  const renderSessionRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      renderSessionRef.current?.abort();
      renderSessionRef.current = null;
      const jobId = activeJobIdRef.current;
      activeJobIdRef.current = null;
      if (jobId) void cancelRender(jobId).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!videoPath) {
      setStatus('IDLE'); setEnvironment(null); setMessage('Chọn video gốc để bắt đầu xuất.'); setResult(null); setProgress(0); setErrorCode(null); return;
    }
    let disposed = false;
    setStatus('CHECKING_ENVIRONMENT'); setMessage('Đang kiểm tra FFmpeg...');
    void checkRenderEnvironment().then((checked) => {
      if (disposed) return; setEnvironment(checked);
      if (checked.ready) { setStatus('READY'); setErrorCode(null); setMessage(checked.ffmpegVersion || checked.message); }
      else { setStatus('ERROR'); setMessage(checked.message); }
    }).catch((error) => { if (!disposed) { setStatus('ERROR'); setMessage(messageFromError(error)); } });
    return () => { disposed = true; };
  }, [videoPath]);

  const suggestedOutputPath = useMemo(() => defaultOutputPath(videoPath), [videoPath]);

  const exportSubtitleSegments = useMemo(
    () => buildSubtitleDisplayCues(subtitleSegments)
      .filter((cue) => cue.text.trim() && cue.end > cue.start)
      .map((cue, index) => ({
        id: `${subtitleSegments[cue.sourceIndex]?.id ?? `seg-${cue.sourceIndex + 1}`}-p${cue.partIndex + 1}-${index}`,
        startMs: Math.max(0, Math.round(cue.start * 1000)),
        endMs: Math.max(Math.round(cue.start * 1000) + 1, Math.round(cue.end * 1000)),
        text: cue.text.trim(),
      })),
    [subtitleSegments],
  );

  const chooseOutput = useCallback(async (): Promise<string | null> => {
    try {
      const selected = await chooseExportOutputPath(outputPath || suggestedOutputPath);
      if (selected) {
        setOutputPath(selected);
        setResult(null);
        if (environment?.ready) {
          setStatus('READY');
          setMessage(environment.ffmpegVersion || 'FFmpeg sẵn sàng.');
        }
      }
      return selected;
    } catch (error) {
      const text = messageFromError(error);
      setStatus('ERROR');
      setMessage(text);
      addLog(`EXPORT ERROR — ${text}`, 'ERROR');
      return null;
    }
  }, [addLog, environment?.ffmpegVersion, environment?.ready, outputPath, suggestedOutputPath]);


  const exportSourceReady = Boolean(videoPath);
  const exportSummary = {
    video: Boolean(videoPath),
    audio: dubbedAudioPath ? 'dubbed' as const : 'original' as const,
    subtitles: subtitleTrackVisible && exportSubtitleSegments.length > 0,
    logo: Boolean(logoPath),
  };
  const exportBusy = status === 'PREPARING' || status === 'RENDERING' || status === 'FINALIZING' || status === 'CANCEL_REQUESTED';
  const canExport = exportSourceReady && Boolean(environment?.ready) && !exportBusy;

  const renderMuteMvp = useCallback(async () => {
    if (!videoPath) {
      setStatus('ERROR');
      setMessage('Video hiện tại không có native path. Hãy chọn lại video bằng bộ chọn file của Desktop.');
      addLog('EXPORT ERROR — source video không có native path.', 'ERROR');
      return;
    }

    let checked = environment;
    if (!checked?.ready) {
      setStatus('CHECKING_ENVIRONMENT');
      setMessage('Đang kiểm tra FFmpeg...');
      try {
        checked = await checkRenderEnvironment();
        setEnvironment(checked);
      } catch (error) {
        const text = messageFromError(error);
        setStatus('ERROR');
        setMessage(text);
        addLog(`EXPORT ERROR — ${text}`, 'ERROR');
        return;
      }
      if (!checked.ready) {
        setStatus('ERROR');
        setMessage(checked.message);
        addLog(`EXPORT ERROR — ${checked.message}`, 'ERROR');
        return;
      }
    }

    let selectedOutput = outputPath;
    if (!selectedOutput) {
      selectedOutput = await chooseOutput();
      if (!selectedOutput) {
        setStatus('READY');
        setMessage('Đã hủy chọn file output.');
        return;
      }
    }

    const subtitleEnabled = subtitleTrackVisible && exportSubtitleSegments.length > 0;
    const backgroundOpacity = clamp(1 - clamp(subtitleTransparency, 0, 100) / 100, 0, 1);

    const jobId = `render-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;


    const request: ExportRequestV1 = {


      schemaVersion: 1,


      jobId,
      sourceVideoPath: videoPath,
      sourceDurationMs,
      dubbedAudioPath,
      outputPath: selectedOutput,
      format: 'mp4',
      video: { ...DEFAULT_EXPORT_VIDEO_SETTINGS },
      audio: {
        ...DEFAULT_EXPORT_AUDIO_SETTINGS,
        mode: dubbedAudioPath ? 'mute' : 'keep',
        sourceGain: dubbedAudioPath ? 0 : 1,
        dubbedGain: dubbedAudioPath ? 1 : 0,
      },
      subtitles: {
        enabled: subtitleEnabled,
        segments: exportSubtitleSegments,
        style: {
          stageWidth: STAGE_W,
          stageHeight: STAGE_H,
          x: subtitleBox.x,
          y: subtitleBox.y,
          width: subtitleBox.w,
          height: subtitleBox.h,
          fontSize: subtitleSize,
          textColor: subtitleColor,
          backgroundColor: subtitleBackgroundColor,
          backgroundOpacity,
          outline: subtitleOutline,
          outlineWidth: subtitleOutlineWidth,
        },
      },
      logo: {
        enabled: Boolean(logoPath),
        path: logoPath,
        x: logoBox.x,
        y: logoBox.y,
        width: logoBox.w,
        height: logoBox.h,
      },
    };

    renderSessionRef.current?.abort();
    const renderSession = new AbortController();
    renderSessionRef.current = renderSession;
    activeJobIdRef.current = jobId;
    setActiveJobId(jobId);
    setStatus('PREPARING');
    setErrorCode(null);
    setProgress(0);
    lastProgressLogBucketRef.current = -1;
    setMessage('Đang chuẩn bị dữ liệu render...');
    setResult(null);
    addLog(`RENDER PLAN — job=${jobId} — video=SOURCE — audio=${dubbedAudioPath ? 'A2_DUBBED' : 'A1_ORIGINAL'} — subtitles=${subtitleEnabled ? 'ON' : 'OFF'} — logo=${logoPath ? 'ON' : 'OFF'} — workflowComplete=${pipelineDone}`, 'RENDER');
    addLog(`RENDER OUTPUT — ${selectedOutput}`, 'RENDER');

    try {
      const completed = await startRender(
        request,
        (event) => {
          if (!mountedRef.current) return;
          const next = Math.max(0, Math.min(100, event.progress));
          setProgress(next);
          if (event.status === 'PREPARING') { setStatus('PREPARING'); setMessage('Đang chuẩn bị render...'); return; }
          if (event.status === 'RENDERING') {
            setStatus('RENDERING'); setMessage(`Đang xuất video... ${Math.round(next)}%`);
            const bucket = Math.min(90, Math.floor(next / 10) * 10);
            if (bucket >= 0 && bucket > lastProgressLogBucketRef.current) {
              lastProgressLogBucketRef.current = bucket;
              addLog(`FFMPEG PROGRESS — ${bucket}% — out=${event.outTimeMs}ms${event.speed ? ` — speed=${event.speed}` : ''}`, 'RENDER');
            }
            return;
          }
          if (event.status === 'FINALIZING') { setStatus('FINALIZING'); setMessage('Đang hoàn tất file xuất...'); return; }
          if (event.status === 'COMPLETED') setProgress(100);
        },
        (entry) => {
          if (!mountedRef.current) return;
          addLog(`RENDER ${entry.stage} — ${entry.message}`,
            entry.level === 'ERROR' ? 'ERROR' : 'RENDER');
        },
        renderSession.signal,
      );
      if (!mountedRef.current) return;
      setResult(completed);
      setOutputPath(completed.outputPath);
      setStatus('COMPLETED');
      setProgress(100);
      setMessage(`Render hoàn tất: ${completed.outputPath}`);
      addLog(`RENDER COMPLETED — ${completed.outputPath} — ${completed.outputBytes} bytes — ${completed.elapsedMs} ms`, 'RENDER');
    } catch (error) {
      if (!mountedRef.current) return;
      const value = error && typeof error === 'object'
        ? error as Partial<RenderError>
        : null;
      if (value?.code === 'RENDER_CANCELLED') {
        setStatus('CANCELLED');
        setErrorCode(null);
        setMessage('Đã hủy xuất video.');
        addLog(`RENDER CANCELLED — job=${jobId}`, 'RENDER');
      } else {
        const text = messageFromError(error);
        setStatus('ERROR');
        setErrorCode(errorCodeFromError(error));
        setMessage(value?.message || text);
        addLog(`RENDER ERROR — ${text}`, 'ERROR');
      }
    } finally {
      if (renderSessionRef.current === renderSession) renderSessionRef.current = null;
      activeJobIdRef.current = null;
      if (mountedRef.current) setActiveJobId(null);
    }
  }, [
    addLog, chooseOutput, dubbedAudioPath, environment, exportSubtitleSegments,
    outputPath, pipelineDone, subtitleBackgroundColor, subtitleBox, subtitleColor,
    subtitleOutline, subtitleOutlineWidth, subtitleSize, subtitleTrackVisible,
    subtitleTransparency, videoPath,
    logoPath,
    logoBox,
    sourceDurationMs,
  ]);


  const cancelActiveRender = useCallback(async () => {
    if (!activeJobId || status !== 'RENDERING') return;

    setStatus('CANCEL_REQUESTED');
    setMessage('Đang hủy xuất video...');

    try {
      const response = await cancelRender(activeJobId);
      if (!mountedRef.current) return;
      if (response.status === 'CANCEL_REQUESTED') {
        addLog(`RENDER CANCEL REQUESTED — job=${activeJobId}`, 'RENDER');
      } else {
        setStatus('RENDERING');
        setMessage('Render đã chuyển sang giai đoạn hoàn tất và không thể hủy.');
      }
    } catch (error) {
      if (!mountedRef.current) return;
      const text = messageFromError(error);
      setStatus('RENDERING');
      setMessage(text);
      addLog(`RENDER CANCEL ERROR — ${text}`, 'ERROR');
    }
  }, [activeJobId, addLog, status]);


  const completedOutputPath = result?.outputPath || (status === 'COMPLETED' ? outputPath : null);

  const openCompletedOutput = useCallback(async () => {
    if (!completedOutputPath) return;
    try {
      await openRenderOutput(completedOutputPath);
      if (!mountedRef.current) return;
      setErrorCode(null);
      setMessage('Đã mở file output.');
      addLog(`OUTPUT ACTION — OPEN — ${completedOutputPath}`, 'RENDER');
    } catch (error) {
      const technical = messageFromError(error);
      setErrorCode(errorCodeFromError(error) || 'OUTPUT_OPEN_FAILED');
      setMessage(error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message || technical)
        : technical);
      addLog(`OUTPUT ACTION ERROR — OPEN — ${technical}`, 'ERROR');
    }
  }, [addLog, completedOutputPath]);

  const revealCompletedOutput = useCallback(async () => {
    if (!completedOutputPath) return;
    try {
      await revealRenderOutput(completedOutputPath);
      if (!mountedRef.current) return;
      setErrorCode(null);
      setMessage('Đã mở thư mục chứa output.');
      addLog(`OUTPUT ACTION — REVEAL — ${completedOutputPath}`, 'RENDER');
    } catch (error) {
      const technical = messageFromError(error);
      setErrorCode(errorCodeFromError(error) || 'OUTPUT_REVEAL_FAILED');
      setMessage(error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message || technical)
        : technical);
      addLog(`OUTPUT ACTION ERROR — REVEAL — ${technical}`, 'ERROR');
    }
  }, [addLog, completedOutputPath]);

  const copyCompletedOutputPath = useCallback(async () => {
    if (!completedOutputPath) return;
    try {
      await copyTextToClipboard(completedOutputPath);
      if (!mountedRef.current) return;
      setErrorCode(null);
      setMessage('Đã sao chép đường dẫn output.');
      addLog(`OUTPUT ACTION — COPY PATH — ${completedOutputPath}`, 'RENDER');
    } catch (error) {
      const technical = messageFromError(error);
      setErrorCode('OUTPUT_COPY_FAILED');
      setMessage(error instanceof Error ? error.message : technical);
      addLog(`OUTPUT ACTION ERROR — COPY PATH — ${technical}`, 'ERROR');
    }
  }, [addLog, completedOutputPath]);

  return {
    status, environment, outputPath, message, result, progress, activeJobId, errorCode,
    running:
      status === 'PREPARING' || status === 'RENDERING' || status === 'FINALIZING' || status === 'CANCEL_REQUESTED',
    cancelling: status === 'CANCEL_REQUESTED',
    cancellable: status === 'RENDERING',
    canExport,
    exportSourceReady,
    exportSummary,
    chooseOutput,
    renderMuteMvp,
    cancelActiveRender,
    openCompletedOutput,
    revealCompletedOutput,
    copyCompletedOutputPath,
  };
}

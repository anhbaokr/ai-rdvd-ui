import { useCallback, useMemo, useState } from 'react';
import type { AutoStage, EditTab, SubtitleSegment, TranslationRunResult, TtsCue, TtsGenerationResult, UiText } from '../types';

interface TranslationOutcome {
  result: TranslationRunResult;
  file: File;
  accepted: boolean;
  acceptedText: string;
}

interface UsePipelineOptions {
  videoFile: File | null;
  dialogueFile: File | null;
  translatedFile: File | null;
  translationAccepted: boolean;
  translationAvailable: boolean;
  translateDialogue: () => Promise<TranslationOutcome>;
  t: UiText;
  generateSpeech: (textOverride?: string, sourceOverride?: string, cues?: TtsCue[]) => Promise<TtsGenerationResult>;
  ttsEngineAvailable: boolean;
  subtitleSegments: SubtitleSegment[];
  addLog: (message: string, category?: string) => void;
  sourceLanguage: 'zh' | 'ko';
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export function usePipeline({
  videoFile,
  dialogueFile,
  translatedFile,
  translationAccepted,
  translationAvailable,
  translateDialogue,
  t,
  generateSpeech,
  ttsEngineAvailable,
  subtitleSegments,
  addLog,
  sourceLanguage,
}: UsePipelineOptions) {
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineDone, setPipelineDone] = useState(false);
  const [autoStage, setAutoStage] = useState<AutoStage>('idle');
  const [editTab, setEditTab] = useState<EditTab>('edit');
  const [exportQueued, setExportQueued] = useState(false);

  const pipeline = useMemo(() => {
    const blocked = !videoFile;
    const translationBlocked = blocked || (!translationAccepted && (!dialogueFile || !translationAvailable));
    const ttsBlocked = blocked || !ttsEngineAvailable || (!translationAccepted && (!dialogueFile || !translationAvailable));
    const asrNeeded = !dialogueFile && !translatedFile;
    const translationNeeded = !translationAccepted;
    const stageIs = (stage: AutoStage) => autoStage === stage;
    const complete = pipelineDone;
    return [
      { key: 'video', label: t.sourceVideo, state: videoFile ? 'ready' : 'blocked', detail: videoFile ? videoFile.name : t.noVideo },
      { key: 'asr', label: t.asr, state: blocked ? 'blocked' : !asrNeeded ? 'skip' : stageIs('recognizing') ? 'run' : complete ? 'ready' : 'run', detail: !asrNeeded ? t.skip : blocked ? t.blocked : stageIs('recognizing') ? t.pipelineRunning : complete ? t.ready : t.run },
      { key: 'translation', label: t.translationReady, state: translationBlocked ? 'blocked' : !translationNeeded ? 'skip' : stageIs('translating') ? 'run' : complete ? 'ready' : 'run', detail: !translationNeeded ? t.skip : translationBlocked ? t.blocked : stageIs('translating') ? t.pipelineRunning : complete ? t.ready : t.run },
      { key: 'tts', label: t.tts, state: ttsBlocked ? 'blocked' : stageIs('dubbing') ? 'run' : complete ? 'ready' : 'run', detail: ttsBlocked ? t.blocked : stageIs('dubbing') ? t.pipelineRunning : complete ? t.ready : t.run },
      { key: 'subtitle', label: t.subtitleStep, state: ttsBlocked ? 'blocked' : stageIs('dubbing') ? 'run' : complete ? 'ready' : 'run', detail: ttsBlocked ? t.blocked : stageIs('dubbing') ? t.pipelineRunning : complete ? t.ready : t.run },
      { key: 'timeline', label: t.timeline, state: ttsBlocked ? 'blocked' : stageIs('committing') ? 'run' : complete ? 'ready' : 'run', detail: ttsBlocked ? t.blocked : stageIs('committing') ? t.pipelineRunning : complete ? t.ready : t.run },
    ] as const;
  }, [videoFile, dialogueFile, translatedFile, translationAccepted, translationAvailable, autoStage, pipelineDone, ttsEngineAvailable, t]);

  const autoActionLabel = useMemo(() => {
    if (autoStage === 'recognizing') return t.autoRecognizing;
    if (autoStage === 'translating') return t.autoTranslating;
    if (autoStage === 'dubbing') return t.autoDubbing;
    if (autoStage === 'committing') return t.autoCommitting;
    return t.autoRender;
  }, [autoStage, t]);

  const startAutoPipeline = useCallback(async () => {
    if (!videoFile || !ttsEngineAvailable || pipelineRunning) return;

    if (sourceLanguage === 'ko') {
      addLog(
        'KO-VI PIPELINE: WAITING_MODEL — Chưa có model dịch Hàn → Việt. Pipeline dừng, không chạy TTS.',
        'MODEL',
      );
      setAutoStage('idle');
      return;
    }
    setPipelineRunning(true);
    setPipelineDone(false);
    setExportQueued(false);
    addLog('Bắt đầu một lượt chạy pipeline mới.', 'PIPELINE');

    if (dialogueFile && !translatedFile) addLog(`${t.skipAsrLog} ${dialogueFile.name}.`);
    if (translatedFile) {
      addLog(`${t.skipAsrLog} ${translatedFile.name}.`);
      if (translationAccepted) addLog(`${t.skipTranslationLog} ${translatedFile.name}.`);
    }

    try {
      if (!dialogueFile && !translatedFile) {
        setAutoStage('recognizing');
        addLog(t.runAsrLog);
        await wait(950);
      }
      let translatedTextOverride: string | undefined;
      let translatedSourceOverride: string | undefined;
      let ttsCues: TtsCue[] = subtitleSegments
        .filter((segment) => segment.text.trim() && segment.end > segment.start)
        .map((segment, index) => ({
          segmentId: segment.id ?? `seg-${String(index + 1).padStart(6, '0')}`,
          startMs: Math.round(segment.start * 1000),
          endMs: Math.round(segment.end * 1000),
          text: segment.text.trim(),
        }));
      if (!translationAccepted) {
        if (!dialogueFile || !translationAvailable) {
          throw new Error('Mô-đun dịch hoặc file lời thoại chưa sẵn sàng.');
        }
        setAutoStage('translating');
        addLog(t.runTranslationLog);
        const outcome = await translateDialogue();
        if (!outcome.accepted) {
          if (outcome.result.status === 'FAIL') {
            throw new Error('Bản dịch có segment FAIL. Kết quả đã đưa lên S1 để sửa nhưng TTS vẫn bị khóa.');
          }
          addLog('Luồng tự động tạm dừng tại bước REVIEW; đây không phải lỗi hệ thống. Hãy duyệt hoặc nạp bản dịch đã sửa rồi chạy tiếp.', 'REVIEW');
          setAutoStage('idle');
          return;
        }
        translatedTextOverride = outcome.acceptedText;
        translatedSourceOverride = outcome.file.name;
        ttsCues = outcome.result.segments
          .filter((segment) => segment.targetText.trim() && segment.endMs > segment.startMs)
          .map((segment) => ({
            segmentId: segment.segmentId,
            startMs: segment.startMs,
            endMs: segment.endMs,
            text: segment.targetText.trim(),
          }));
      }

      setAutoStage('dubbing');
      addLog(t.runTtsLog);
      const result = await generateSpeech(translatedTextOverride, translatedSourceOverride, ttsCues);
      addLog(`${t.ready}: ${result.voiceName} → ${result.outputPath}`);
      addLog(t.runSubtitleLog);
      await wait(350);

      setAutoStage('committing');
      addLog(t.autoCommitting);
      await wait(650);
      setAutoStage('completed');
      setPipelineDone(true);
      addLog(t.renderDoneLog);
      setEditTab('edit');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAutoStage('idle');
      addLog(`PIPELINE ERROR — ${message}`, 'ERROR');
    } finally {
      setPipelineRunning(false);
    }
  }, [videoFile, dialogueFile, translatedFile, translationAccepted, translationAvailable, pipelineRunning, addLog, t, generateSpeech, translateDialogue, ttsEngineAvailable, subtitleSegments, sourceLanguage]);

  const handleFinalExport = useCallback(() => {
    if (!pipelineDone) return;
    setExportQueued(true);
    addLog(t.exportEnginePending);
  }, [pipelineDone, addLog, t.exportEnginePending]);

  return {
    pipelineRunning, pipelineDone, setPipelineDone, autoStage, setAutoStage,
    editTab, setEditTab, exportQueued, setExportQueued,
    pipeline, autoActionLabel,
    startAutoPipeline, handleFinalExport,
  };
}

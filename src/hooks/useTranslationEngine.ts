import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Language,
  SavedTranslationFile,
  SubtitleSegment,
  TranslationEnvironmentResult,
  TranslationProgress,
  TranslationRunResult,
} from '../types';
import {
  cancelTranslation,
  checkTranslationEnvironment,
  installTranslationEnvironment,
  listenTranslationProgress,
  openTranslationOutputDirectory,
  saveTranslationFile,
  translateSegments,
} from '../services/translation';
import { parseTranslationSource, translationResultToSrt } from '../utils/translationSegments';

interface UseTranslationEngineOptions {
  dialogueFile: File | null;
  videoDuration: number;
  language: Language;
  sourceLanguage: 'zh' | 'ko';
  setTranslatedFile: (file: File | null) => void;
  setSubtitleSegments: (segments: SubtitleSegment[]) => void;
  setTranslationAccepted: (accepted: boolean) => void;
  addLog: (message: string, category?: string) => void;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function jobIdFor(file: File) {
  const safeName = file.name.replace(/[^A-Za-z0-9_.-]+/g, '-').slice(0, 36) || 'dialogue';
  return `translation-${safeName}-${file.size}-${file.lastModified}`.slice(0, 96);
}

export function useTranslationEngine({
  dialogueFile,
  videoDuration,
  language,
  sourceLanguage,
  setTranslatedFile,
  setSubtitleSegments,
  setTranslationAccepted,
  addLog,
}: UseTranslationEngineOptions) {
  const [environment, setEnvironment] = useState<TranslationEnvironmentResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<TranslationProgress | null>(null);
  const [result, setResult] = useState<TranslationRunResult | null>(null);
  const [savedFile, setSavedFile] = useState<SavedTranslationFile | null>(null);
  const currentJobId = useRef<string | null>(null);
  const initialCheckStarted = useRef(false);
  const busy = useRef(false);

  const refreshEnvironment = useCallback(async () => {
    addLog('Bắt đầu kiểm tra môi trường dịch Vocalize/Hachimi.', 'TRANSLATION');
    try {
      const checked = await checkTranslationEnvironment();
      setEnvironment(checked);
      addLog(`${checked.ready ? 'READY' : 'NOT READY'} — ${checked.message}`, checked.ready ? 'TRANSLATION' : 'ERROR');
      return checked;
    } catch (error) {
      addLog(`Kiểm tra môi trường dịch thất bại: ${errorMessage(error)}`, 'ERROR');
      throw error;
    }
  }, [addLog]);

  useEffect(() => {
    if (initialCheckStarted.current) return;
    initialCheckStarted.current = true;
    void refreshEnvironment().catch(() => undefined);
  }, [refreshEnvironment]);

  useEffect(() => {
    setResult(null);
    setProgress(null);
    setSavedFile(null);
    setTranslationAccepted(false);
  }, [dialogueFile, setTranslationAccepted]);

  const translateDialogue = useCallback(async () => {
    if (busy.current) throw new Error(language === 'vi' ? 'Tác vụ dịch đang chạy.' : 'A translation job is already running.');
    if (!dialogueFile) {
      throw new Error(language === 'vi' ? 'Chưa có file lời thoại tiếng Trung.' : 'No Chinese dialogue file is loaded.');
    }
    busy.current = true;
    setRunning(true);
    let unlisten: (() => void) | null = null;
    try {
      let checked = environment;
      if (!checked?.ready) checked = await refreshEnvironment();
      if (!checked.ready) {
        const consent = window.confirm(language === 'vi'
          ? 'Mô-đun dịch chưa được cài. Bạn có muốn tải Python packages, HachimiMT và từ điển ngay bây giờ không? Quá trình có thể mất nhiều thời gian.'
          : 'The translation module is not installed. Download Python packages, HachimiMT, and dictionaries now? This may take a while.');
        if (!consent) throw new Error(checked.message);
        addLog('Bắt đầu cài mô-đun dịch lần đầu. Không đóng ứng dụng trong quá trình tải.', 'TRANSLATION');
        checked = await installTranslationEnvironment();
        setEnvironment(checked);
        addLog(`Cài mô-đun dịch hoàn tất — ${checked.message}`, 'TRANSLATION');
      }
      if (!checked.ready) throw new Error(checked.message);

      const content = await dialogueFile.text();
      const sourceSegments = parseTranslationSource(dialogueFile.name, content, videoDuration);
      if (!sourceSegments.length) {
        throw new Error(language === 'vi' ? 'Không tìm thấy câu thoại hợp lệ trong file.' : 'No valid dialogue segments were found.');
      }

      const jobId = jobIdFor(dialogueFile);
      currentJobId.current = jobId;
      setProgress({ jobId, completed: 0, total: sourceSegments.length, segmentId: '', status: 'PASS' });
      setTranslationAccepted(false);
      if (sourceLanguage === 'ko') {
        addLog('Nguồn: Tiếng Hàn (한국어). KO-VI pipeline được chọn.', 'TRANSLATION');
        addLog('KO-VI PIPELINE: WAITING_MODEL — Không sử dụng HachimiMT-60-QT. Dừng dịch cho tới khi cài model Hàn.', 'MODEL');
        throw new Error('[WAITING_MODEL] Korean translation model chưa được tích hợp.');
      }
      addLog(`Bắt đầu dịch ${dialogueFile.name}: ${sourceSegments.length} segment, Trung → Việt.`, 'TRANSLATION');

      unlisten = await listenTranslationProgress((next) => {
        if (next.jobId !== jobId) return;
        setProgress(next);
        if (next.completed === 1 || next.completed === next.total || next.completed % 10 === 0) {
          addLog(`Tiến độ dịch ${next.completed}/${next.total} — ${next.segmentId} — ${next.status}.`, 'TRANSLATION');
        }
      });
      const translated = await translateSegments(jobId, sourceSegments, sourceLanguage, 'vi', true);
      setResult(translated);
      let accepted = translated.accepted && translated.status === 'PASS';
      if (translated.status === 'REVIEW' && (translated.counts.FAIL || 0) === 0) {
        addLog(
          `Bản dịch có ${translated.counts.REVIEW || 0} segment cần duyệt. Đang chờ người dùng xác nhận trước khi chuyển sang TTS.`,
          'REVIEW',
        );
        accepted = window.confirm(language === 'vi'
          ? `Bản dịch có ${translated.counts.REVIEW || 0} câu cần xem lại nhưng không có lỗi FAIL.\n\nNhấn OK để duyệt bản dịch và tiếp tục sang TTS.\nNhấn Hủy để dừng, sửa hoặc nạp lại phụ đề đã chỉnh.`
          : `The translation has ${translated.counts.REVIEW || 0} segment(s) to review and no FAIL errors.\n\nSelect OK to approve it and continue to TTS.\nSelect Cancel to stop, edit, or upload corrected subtitles.`);
        addLog(
          accepted
            ? 'Người dùng đã duyệt bản dịch REVIEW — cho phép chuyển sang TTS.'
            : 'Người dùng chưa duyệt bản dịch REVIEW — luồng dừng để sửa hoặc nạp lại phụ đề.',
          'REVIEW',
        );
      }
      const srt = translationResultToSrt(translated.segments);
      const baseName = dialogueFile.name.replace(/\.[^.]+$/, '') || 'dialogue';
      const fileName = `${baseName}.vi${accepted ? '' : '.review'}.srt`;
      const persisted = await saveTranslationFile(fileName, srt);
      setSavedFile(persisted);
      addLog(`Đã lưu file bản dịch: ${persisted.outputPath}`, 'TRANSLATION');
      const generatedFile = new File([srt], fileName, { type: 'application/x-subrip;charset=utf-8' });
      setTranslatedFile(generatedFile);
      setSubtitleSegments(translated.segments.map((segment) => ({
        id: segment.segmentId,
        start: segment.startMs / 1000,
        end: segment.endMs / 1000,
        text: segment.targetText,
      })));
      setTranslationAccepted(accepted);
      addLog(
        `Dịch hoàn tất: PASS=${translated.counts.PASS || 0}, REVIEW=${translated.counts.REVIEW || 0}, FAIL=${translated.counts.FAIL || 0}.`,
        translated.status === 'PASS' ? 'TRANSLATION' : 'REVIEW',
      );
      if (!accepted) {
        addLog(
          translated.status === 'FAIL'
            ? 'Bản dịch có segment FAIL. Kết quả đã hiển thị trên S1 nhưng bị chặn TTS cho tới khi nạp bản đã sửa.'
            : 'Bản dịch đã hiển thị trên S1 nhưng chưa được duyệt để chuyển sang TTS.',
          translated.status === 'FAIL' ? 'ERROR' : 'REVIEW',
        );
      }
      return {
        result: translated,
        file: generatedFile,
        accepted,
        acceptedText: accepted ? translated.segments.map((segment) => segment.targetText).join(' ') : '',
      };
    } catch (error) {
      addLog(`Dịch thất bại: ${errorMessage(error)}`, 'ERROR');
      throw error;
    } finally {
      unlisten?.();
      currentJobId.current = null;
      busy.current = false;
      setRunning(false);
    }
  }, [addLog, dialogueFile, environment, language, sourceLanguage, refreshEnvironment, setSubtitleSegments, setTranslatedFile, setTranslationAccepted, videoDuration]);

  const cancel = useCallback(async () => {
    if (!currentJobId.current) return;
    await cancelTranslation(currentJobId.current);
    addLog('Đã gửi yêu cầu hủy; worker sẽ dừng sau segment hiện tại.', 'TRANSLATION');
  }, [addLog]);

  const openOutputDirectory = useCallback(async () => {
    const directory = await openTranslationOutputDirectory();
    addLog(`Đã mở thư mục bản dịch: ${directory}`, 'TRANSLATION');
    return directory;
  }, [addLog]);

  return {
    environment,
    ready: environment?.ready === true,
    running,
    progress,
    result,
    savedFile,
    refreshEnvironment,
    translateDialogue,
    cancel,
    openOutputDirectory,
  };
}

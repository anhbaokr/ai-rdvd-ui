import { useCallback, useRef, useState } from 'react';
import type { RecognizeMode, RecognitionProgress, RecognitionResult } from '../types';
import {
  listenRecognitionLog,
  listenRecognitionProgress,
  startRecognition as invokeStartRecognition,
} from '../services/recognition';

type AddLog = (message: string, category?: string) => void;

interface UseRecognitionOptions {
  videoPath: string | null;
  mode: RecognizeMode;
  sourceLanguage: 'zh' | 'ko';
  language: 'vi' | 'en';
  addLog: AddLog;
}

export function useRecognition({
  videoPath,
  mode,
  sourceLanguage,
  language,
  addLog,
}: UseRecognitionOptions) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<RecognitionProgress | null>(null);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const busy = useRef(false);

  const run = useCallback(async () => {
    if (busy.current) {
      throw new Error(language === 'vi' ? 'Tác vụ nhận dạng đang chạy.' : 'A recognition task is already running.');
    }
    if (!videoPath) {
      throw new Error(language === 'vi'
        ? 'Chưa có đường dẫn video native. Hãy chọn video bằng nút Nhập video.'
        : 'No native video path is available. Choose the video again from the Import button.');
    }

    busy.current = true;
    setRunning(true);
    setProgress({
      phase: 'starting',
      completed: 0,
      total: 0,
      percent: 0,
      message: language === 'vi' ? 'Đang khởi động nhận dạng...' : 'Starting recognition...',
    });
    setResult(null);

    let unlistenLog: (() => void) | null = null;
    let unlistenProgress: (() => void) | null = null;

    try {
      unlistenLog = await listenRecognitionLog((event) => {
        addLog(event.message, event.category || 'RECOGNITION');
      });
      unlistenProgress = await listenRecognitionProgress((event) => {
        setProgress(event);
      });

      const output = await invokeStartRecognition({
        videoPath,
        mode,
        sourceLanguage,
      });
      setResult(output);
      if (output.warning) addLog(output.warning, 'RECOGNITION');
      return output;
    } finally {
      if (unlistenLog) unlistenLog();
      if (unlistenProgress) unlistenProgress();
      busy.current = false;
      setRunning(false);
    }
  }, [addLog, language, mode, sourceLanguage, videoPath]);

  return {
    running,
    progress,
    result,
    startRecognition: run,
  };
}

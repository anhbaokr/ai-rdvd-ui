import { useCallback, useState } from 'react';
import { appendTechnicalLog, clearTechnicalLog, openTechnicalLogDirectory } from '../services/tts';

const MAX_VISIBLE_LOG_LINES = 5;

function timestamp() {
  return new Date().toLocaleTimeString('vi-VN', { hour12: false });
}

export function useAppLog(emptyMessage: string) {
  const [renderLogs, setRenderLogs] = useState<string[]>([]);

  const addLogs = useCallback((messages: readonly string[], category = 'APP') => {
    const cleaned = messages.map((message) => message.trim()).filter(Boolean);
    if (!cleaned.length) return;
    const stamp = timestamp();
    const lines = cleaned.map((message) => `[${stamp}] [${category}] ${message}`);
    setRenderLogs((items) => [...items, ...lines].slice(-MAX_VISIBLE_LOG_LINES));
    void appendTechnicalLog(lines).catch(() => undefined);
  }, []);

  const addLog = useCallback((message: string, category = 'APP') => {
    addLogs([message], category);
  }, [addLogs]);

  const clearLog = useCallback(async () => {
    setRenderLogs([]);
    try {
      await clearTechnicalLog();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRenderLogs([`[${timestamp()}] [ERROR] Không xóa được file log: ${message}`]);
    }
  }, []);

  const exportLog = useCallback(() => {
    const content = renderLogs.length ? renderLogs.join('\n') : emptyMessage;
    const blob = new Blob([content + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ai-rdvd-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [emptyMessage, renderLogs]);

  const openLogFolder = useCallback(async () => {
    try {
      const directory = await openTechnicalLogDirectory();
      addLog(`Đã mở thư mục log: ${directory}`, 'LOG');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`Không mở được thư mục log: ${message}`, 'ERROR');
    }
  }, [addLog]);

  return {
    renderLogs,
    addLog,
    addLogs,
    clearLog,
    exportLog,
    openLogFolder,
  };
}

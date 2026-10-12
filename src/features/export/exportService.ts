import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import type {
  CancelRenderResult,
  ExportRequestV1,
  RenderEnvironmentResult,
  RenderLogEvent,
  RenderProgressEvent,
  RenderResult,
} from './exportContracts';

const isTauriRuntime = () => Boolean(
  (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
);

export async function checkRenderEnvironment(): Promise<RenderEnvironmentResult> {
  if (!isTauriRuntime()) {
    return {
      status: 'NOT_READY',
      ready: false,
      ffmpegPath: null,
      ffmpegVersion: null,
      message: 'Render chỉ khả dụng trong ứng dụng desktop Tauri.',
      diagnostics: ['Không phát hiện Tauri runtime. Hãy chạy npm run tauri:dev.'],
    };
  }

  return invoke<RenderEnvironmentResult>('check_render_environment');
}

export async function chooseExportOutputPath(defaultPath?: string): Promise<string | null> {
  if (!isTauriRuntime()) {
    throw new Error('Chọn file xuất chỉ khả dụng trong ứng dụng desktop Tauri.');
  }

  const selected = await save({
    title: 'Xuất video AI RDvD',
    defaultPath,
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });

  if (!selected) return null;
  return selected.toLowerCase().endsWith('.mp4') ? selected : `${selected}.mp4`;
}

export async function startRender(
  request: ExportRequestV1,
  onProgress?: (progress: RenderProgressEvent) => void,
  onLog?: (entry: RenderLogEvent) => void,
  signal?: AbortSignal,
): Promise<RenderResult> {
  if (!isTauriRuntime()) throw new Error('Render chỉ khả dụng trong ứng dụng desktop Tauri.');

  let unlistenProgress: (() => void) | null = null;
  let unlistenLog: (() => void) | null = null;
  let disposed = Boolean(signal?.aborted);

  const cleanupListeners = () => {
    unlistenProgress?.();
    unlistenLog?.();
    unlistenProgress = null;
    unlistenLog = null;
  };
  const handleAbort = () => {
    disposed = true;
    cleanupListeners();
  };

  signal?.addEventListener('abort', handleAbort, { once: true });
  try {
    if (disposed) throw new Error('Render session đã bị hủy trước khi khởi động.');

    if (onProgress) {
      const unlisten = await listen<RenderProgressEvent>('render-progress', (event) => {
        if (!disposed && event.payload.jobId === request.jobId) onProgress(event.payload);
      });
      if (disposed) unlisten();
      else unlistenProgress = unlisten;
    }

    if (disposed) throw new Error('Render session đã bị hủy trước khi khởi động.');

    if (onLog) {
      const unlisten = await listen<RenderLogEvent>('render-log', (event) => {
        if (!disposed && event.payload.jobId === request.jobId) onLog(event.payload);
      });
      if (disposed) unlisten();
      else unlistenLog = unlisten;
    }

    if (disposed) throw new Error('Render session đã bị hủy trước khi khởi động.');
    return await invoke<RenderResult>('start_render', { request });
  } finally {
    disposed = true;
    cleanupListeners();
    signal?.removeEventListener('abort', handleAbort);
  }
}

export async function cancelRender(jobId: string): Promise<CancelRenderResult> {
  if (!isTauriRuntime()) {
    throw new Error('Hủy render chỉ khả dụng trong ứng dụng desktop Tauri.');
  }

  return invoke<CancelRenderResult>('cancel_render', { jobId });
}

export async function openRenderOutput(path: string): Promise<{ status: string; path: string }> {
  if (!isTauriRuntime()) {
    throw new Error('Mở file output chỉ khả dụng trong ứng dụng desktop Tauri.');
  }
  return invoke<{ status: string; path: string }>('open_render_output', { path });
}

export async function revealRenderOutput(path: string): Promise<{ status: string; path: string }> {
  if (!isTauriRuntime()) {
    throw new Error('Mở thư mục output chỉ khả dụng trong ứng dụng desktop Tauri.');
  }
  return invoke<{ status: string; path: string }>('reveal_render_output', { path });
}

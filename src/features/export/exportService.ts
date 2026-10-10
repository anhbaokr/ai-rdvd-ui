import { invoke } from '@tauri-apps/api/core';
import type { RenderEnvironmentResult } from './exportContracts';

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
